#!/usr/bin/env node
/**
 * MCP server for Task Orchestrator task management.
 *
 * A thin stdio bridge for Claude Desktop / Claude Cowork (and any MCP client):
 * every tool call is executed by spawning the battle-tested skill CLI
 * (../bin/to-db.mjs), which owns ALL safety guarantees — transactions,
 * automatic pre-write backups, invariant checks, journaled sync-safe rollback,
 * soft deletes, Lamport/sync bookkeeping, and the app-running guard.
 *
 * Deliberately NOT exposed: restore-backup, --force-app-open,
 * --confirm-mass-delete, bulk delete. This server never overrides a guard.
 *
 * Register in %APPDATA%\Claude\claude_desktop_config.json:
 *   "task-orchestrator": { "command": "node", "args": ["<repo>/skills/task-orchestrator-db/mcp/server.mjs"] }
 * Optional env overrides (via the config's "env"): TO_DB_PATH, TO_REPO_PATH.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, '..', 'bin', 'to-db.mjs')
const execFileAsync = promisify(execFile)

// ─── CLI bridge ─────────────────────────────────────────────────────────────

class CliError extends Error {}

async function runCli(args) {
  let stdout = ''
  try {
    ;({ stdout } = await execFileAsync(process.execPath, [CLI, ...args], {
      timeout: 180_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    }))
  } catch (e) {
    stdout = e.stdout || ''
    if (!stdout) throw new CliError(`CLI failed to run: ${e.message}`)
  }
  let result
  try { result = JSON.parse(stdout) } catch {
    throw new CliError(`CLI produced non-JSON output: ${stdout.slice(0, 500)}`)
  }
  if (result.ok) return result

  // Map exit/error codes to actionable guidance for the model.
  switch (result.code) {
    case 4:
      throw new CliError(
        `${result.error}\nGuidance: the Task Orchestrator app is running and this app version does not support live ` +
        `refresh of external changes. Ask the user to close Task Orchestrator (or update it to a version with live ` +
        `refresh), then retry. Do NOT attempt to bypass this — reads still work.`)
    case 3:
      throw new CliError(`${result.error}\nGuidance: the database schema and this integration are out of sync. Tell the user; do not retry.`)
    case 6:
      throw new CliError(`${result.error}\nGuidance: some rows changed after that operation, so an automatic rollback is unsafe. Report the conflict to the user.`)
    default:
      throw new CliError(result.error || `CLI error (code ${result.code})`)
  }
}

function ok(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}
function tool(handler) {
  return async (args) => {
    try { return ok(await handler(args ?? {})) } catch (e) {
      return { content: [{ type: 'text', text: e.message }], isError: true }
    }
  }
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const dateField = z.string().regex(ISO_DATE, 'must be YYYY-MM-DD')
const idField = z.string().min(4).describe(
  'Task id (26-char ULID) or a short task reference like "to:7K3MZ" — the unique trailing part of the id, ' +
  'case-insensitive. Users paste references copied from the app as lines "to:CODE Title"; pass them as-is (with or ' +
  'without the to: prefix). An ambiguous or unknown reference returns an error listing candidates — ask the user, never guess.')
const noteField = z.object({
  content: z.string().min(1),
  id: z.string().optional(),
  createdAt: z.string().optional(),
})

const TASK_FIELDS = {
  title: z.string().min(1).describe('Task title (required, non-empty)'),
  status: z.enum(['inbox', 'active', 'done', 'cancelled']).optional().describe('Default: inbox'),
  priority: z.number().int().min(1).max(4).optional().describe('1 = highest … 4 = none (default)'),
  list: z.string().min(1).optional().describe('List name (free string)'),
  due: dateField.optional().describe('Due date, YYYY-MM-DD (convert natural language to ISO yourself)'),
  dateStart: dateField.optional().describe('Start date, YYYY-MM-DD'),
  recurrence: z.string().optional().describe('"daily" | "weekly" | "monthly" | "yearly" or an RRULE starting with FREQ='),
  tags: z.array(z.string().min(1)).optional(),
  personas: z.array(z.string().min(1)).optional(),
  url: z.string().optional(),
  estimate: z.string().optional().describe('Free string; prefer "30 min" / "2 hours" so the Day Planner can parse it'),
  dependsOn: z.array(z.string()).optional().describe('Ids or to:REF references of blocker tasks (must exist; no cycles)'),
  notes: z.array(noteField).optional().describe('Notes to attach'),
}

const UPDATE_FIELDS = {
  title: TASK_FIELDS.title.optional(),
  status: TASK_FIELDS.status.describe('Prefer complete_tasks / reopen_task over raw status writes'),
  priority: TASK_FIELDS.priority,
  list: z.string().min(1).nullable().optional().describe('null clears the list'),
  due: dateField.nullable().optional().describe('YYYY-MM-DD, or null to clear'),
  dateStart: dateField.nullable().optional(),
  recurrence: z.string().nullable().optional(),
  tags: z.array(z.string().min(1)).optional().describe('REPLACES the full tag list'),
  personas: z.array(z.string().min(1)).optional(),
  url: z.string().nullable().optional(),
  estimate: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).nullable().optional(),
  notes: z.array(noteField).optional().describe('REPLACES the whole note list — to append, get_task first and send old + new'),
}

// ─── Server & tools ─────────────────────────────────────────────────────────

const server = new McpServer(
  { name: 'task-orchestrator', version: '1.0.0' },
  {
    instructions:
      'Task Orchestrator is the user\'s PERSONAL task manager. Short requests like "add a task ...", "task: ...", ' +
      '"create tasks from this document/meeting" refer to it by default (work-tracker systems like Jira are only meant ' +
      'when named explicitly). Safe management via a guarded CLI: dates are always ISO YYYY-MM-DD; every write is ' +
      'transactional, backed up and journaled; mutation results include side effects (spawnedNext for recurring tasks, ' +
      'activatedDependents) — report them to the user. If a write fails because an app version without live-refresh ' +
      'support is running, ask the user to close or update the app. TASK REFERENCES: tasks are cited as "to:XXXXX" ' +
      '(the unique trailing part of the id); every id parameter accepts them, and results carry a "ref" field. When the ' +
      'user pastes copied lines like "to:7K3MZ Title", resolve each ref and VERIFY the fetched title matches the pasted ' +
      'one — on mismatch or ambiguity, ask instead of acting. Mention the ref when reporting a task you created or ' +
      'changed (so the user can refer back to it), but omit refs in plain overview listings.',
  },
)

server.registerTool('create_task', {
  title: 'Create a task',
  description: 'Create one task in Task Orchestrator. Returns the new task id and any warnings (e.g. duplicate title).',
  inputSchema: TASK_FIELDS,
}, tool(async (args) => {
  const r = await runCli(['add', '--json', JSON.stringify(args)])
  return { created: r.results?.[0], opId: r.opId, warnings: r.warnings }
}))

server.registerTool('create_tasks_batch', {
  title: 'Create multiple tasks (atomic)',
  description:
    'Create up to 50 tasks in ONE atomic transaction — all or nothing. Ideal for tasks extracted from a document or ' +
    'meeting summary. Pass a stable batchId to make retries idempotent (a batch that already succeeded is not applied twice). ' +
    'If task B depends on task A from the same batch, create A first and use two calls (ids are assigned server-side).',
  inputSchema: {
    tasks: z.array(z.object(TASK_FIELDS)).min(1).max(50),
    batchId: z.string().optional().describe('Stable id for idempotent retries, e.g. derived from the source document'),
  },
}, tool(async ({ tasks, batchId }) => {
  const ops = tasks.map(t => ({ action: 'add', task: t }))
  const args = ['batch', '--json', JSON.stringify({ ops })]
  if (batchId) args.push('--batch-id', batchId)
  const r = await runCli(args)
  return { idempotent: r.idempotent, created: r.results, opId: r.opId, warnings: r.warnings }
}))

server.registerTool('list_tasks', {
  title: 'List / search tasks',
  description: 'List tasks with filters. Use this to find task ids — never guess ids. Returns live (non-deleted) tasks by default; each task includes a short "ref" (to:XXXXX) for citing it.',
  inputSchema: {
    status: z.array(z.enum(['inbox', 'active', 'done', 'cancelled'])).optional(),
    search: z.string().optional().describe('Case-insensitive substring match on the title'),
    list: z.string().optional(),
    tag: z.string().optional(),
    flow: z.string().optional(),
    persona: z.string().optional(),
    dueBefore: dateField.optional(),
    dueAfter: dateField.optional(),
    overdue: z.boolean().optional().describe('Only overdue open tasks'),
    recurring: z.boolean().optional(),
    includeDeleted: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional().describe('Default 100'),
  },
}, tool(async (f) => {
  const args = ['list', '--limit', String(f.limit ?? 100)]
  if (f.status?.length) args.push('--status', f.status.join(','))
  for (const [flag, val] of [['search', f.search], ['list', f.list], ['tag', f.tag], ['flow', f.flow], ['persona', f.persona], ['due-before', f.dueBefore], ['due-after', f.dueAfter]]) {
    if (val) args.push(`--${flag}`, val)
  }
  if (f.overdue) args.push('--overdue')
  if (f.recurring) args.push('--recurring')
  if (f.includeDeleted) args.push('--include-deleted')
  const r = await runCli(args)
  return { count: r.count, tasks: r.tasks }
}))

server.registerTool('get_task', {
  title: 'Get a task',
  description: 'Full task details: all fields, notes, blockers (dependencies), dependents, day-planner slots.',
  inputSchema: { id: idField },
}, tool(async ({ id }) => {
  const r = await runCli(['get', id])
  return { task: r.task, blockers: r.blockers, dependents: r.dependents, plannerSlots: r.plannerSlots }
}))

server.registerTool('update_task', {
  title: 'Update a task',
  description: 'Update fields of one task. Only the fields you pass are changed; pass null to clear a nullable field. tags/notes REPLACE the full list.',
  inputSchema: { id: idField, changes: z.object(UPDATE_FIELDS) },
}, tool(async ({ id, changes }) => {
  if (!changes || !Object.keys(changes).length) throw new CliError('changes must contain at least one field')
  const r = await runCli(['update', id, '--json', JSON.stringify(changes)])
  return { result: r.results?.[0], opId: r.opId, warnings: r.warnings }
}))

server.registerTool('complete_tasks', {
  title: 'Complete tasks',
  description:
    'Mark tasks done. Side effects are automatic and reported: a recurring task spawns its next occurrence (spawnedNext); ' +
    'inbox tasks whose blockers are now all done get activated (activatedDependents). A task with unfinished dependencies ' +
    'is refused — complete the blockers first, or set skipBlocked to skip it with a warning.',
  inputSchema: {
    ids: z.array(idField).min(1).max(20),
    skipBlocked: z.boolean().optional(),
  },
}, tool(async ({ ids, skipBlocked }) => {
  const args = ['complete', ...ids]
  if (skipBlocked) args.push('--skip-blocked')
  const r = await runCli(args)
  return { results: r.results, opId: r.opId, warnings: r.warnings }
}))

server.registerTool('reopen_task', {
  title: 'Reopen a task',
  description: 'Reopen a completed task (done → active). If it is recurring and its spawned next occurrence is still untouched, that occurrence is removed.',
  inputSchema: { id: idField },
}, tool(async ({ id }) => {
  const r = await runCli(['reopen', id])
  return { result: r.results?.[0], opId: r.opId, warnings: r.warnings }
}))

server.registerTool('delete_task', {
  title: 'Delete a task',
  description: 'Soft-delete one task (recoverable tombstone; propagates correctly to synced devices). There is no permanent delete.',
  inputSchema: { id: idField },
}, tool(async ({ id }) => {
  const r = await runCli(['delete', id])
  return { result: r.results?.[0], opId: r.opId, warnings: r.warnings }
}))

server.registerTool('restore_task', {
  title: 'Restore a deleted task',
  description: 'Bring a soft-deleted task back to life (counterpart of delete_task; works for deletions made elsewhere too).',
  inputSchema: { id: idField },
}, tool(async ({ id }) => {
  const r = await runCli(['restore', id])
  return { result: r.results?.[0], opId: r.opId, warnings: r.warnings }
}))

server.registerTool('rollback_operation', {
  title: 'Roll back an operation',
  description:
    'Undo a previous mutation made through this server, using the opId returned by that call. Sync-safe: applied as a new ' +
    'forward change. Refused if the affected rows were modified afterwards.',
  inputSchema: { opId: z.string() },
}, tool(async ({ opId }) => {
  const r = await runCli(['rollback', '--op', opId])
  return { results: r.results, opId: r.opId, warnings: r.warnings }
}))

server.registerTool('db_status', {
  title: 'Database status',
  description: 'Health check: DB path, schema, whether the app is running and supports live external writes, task counts, integrity, last agent operation.',
  inputSchema: {},
}, tool(async () => {
  const r = await runCli(['status'])
  const { ok: _ok, vectorClock: _vc, ...rest } = r
  return rest
}))

// ─── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
