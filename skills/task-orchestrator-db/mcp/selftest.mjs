#!/usr/bin/env node
/**
 * Self-test for the MCP server: speaks the real MCP protocol over stdio
 * (initialize → tools/list → tools/call) against a fixture database built from
 * the repo's own migrations. No real user data involved.
 *
 * The fixture seeds the app's live-refresh capability flag so mutations run
 * even when a real Task Orchestrator process is up on this machine.
 *
 *   node mcp/selftest.mjs
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { buildFixture } from '../lib/fixture.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// withRegistry: a fresh instance row marks the fixture DB as open in a
// live-refresh-capable app, so mutations pass the guard even when a real
// Task Orchestrator process is running on this machine.
const fixture = await buildFixture({ withRegistry: true })
const { dbPath: TEST_DB, domain } = fixture

let passed = 0, failed = 0
const failures = []
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS ${name}`) }
  else { failed++; failures.push(name); console.log(`FAIL ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 500) : ''}`) }
}

const client = new Client({ name: 'selftest', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, 'server.mjs')],
  // TO_DB_TEST_FAKE_APP makes the guard fully deterministic: one fake app
  // process with pid 0, matching the fixture registry row's pid.
  env: { ...process.env, TO_DB_PATH: TEST_DB, TO_REGISTRY_PATH: fixture.registryPath, TO_DB_TEST_FAKE_APP: '1' },
  stderr: 'ignore', // node:sqlite ExperimentalWarning noise
})
await client.connect(transport)

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args })
  const text = res.content?.[0]?.text ?? ''
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { isError: !!res.isError, text, json }
}

try {
  // ── tools/list ─────────────────────────────────────────────────────────
  const { tools } = await client.listTools()
  const names = tools.map(t => t.name).sort()
  check('tools/list exposes exactly the intended surface', JSON.stringify(names) === JSON.stringify([
    'complete_tasks', 'create_task', 'create_tasks_batch', 'db_status', 'delete_task',
    'get_task', 'list_tasks', 'reopen_task', 'restore_task', 'rollback_operation', 'update_task',
  ]), names)
  check('no dangerous tools exposed', !names.some(n => /backup|force|mass|clear/.test(n)))

  // ── db_status ──────────────────────────────────────────────────────────
  let r = await call('db_status', {})
  check('db_status ok + sees live instance', !r.isError && r.json?.schemaOk === true &&
    r.json.appInstances?.some(i => i.onThisDb), r.text)

  // ── create_task ────────────────────────────────────────────────────────
  r = await call('create_task', {
    title: 'MCP-TEST alpha', status: 'active', priority: 2, list: 'McpList',
    due: '2030-02-01', recurrence: 'weekly', tags: ['mcp-test'],
    notes: [{ content: 'from meeting summary' }],
  })
  const alphaId = r.json?.created?.id
  check('create_task ok', !r.isError && !!alphaId && !!r.json.opId, r.text)

  r = await call('get_task', { id: alphaId })
  check('get_task returns fields + notes', !r.isError && r.json?.task?.title === 'MCP-TEST alpha' &&
    r.json.task.recurrence === 'weekly' && r.json.task.notes?.length === 1, r.text)

  // ── validation errors surface as tool errors ───────────────────────────
  r = await call('create_task', { title: 'MCP-TEST bad', due: 'next friday' })
  check('non-ISO due rejected by schema', r.isError && /YYYY-MM-DD/.test(r.text), r.text)
  r = await call('update_task', { id: 'NO-SUCH-ID', changes: { priority: 1 } })
  check('unknown id -> tool error', r.isError && /not found/.test(r.text), r.text)

  // ── batch + idempotency ────────────────────────────────────────────────
  const batch = {
    batchId: 'mcp-selftest-001',
    tasks: [
      { title: 'MCP-TEST batch-A', priority: 3, tags: ['mcp-test'] },
      { title: 'MCP-TEST batch-B', status: 'active', due: '2030-03-01' },
    ],
  }
  r = await call('create_tasks_batch', batch)
  const batchOpId = r.json?.opId
  const createdIds = (r.json?.created || []).map(x => x.id)
  check('batch created 2 tasks atomically', !r.isError && createdIds.length === 2 && !!batchOpId, r.text)
  r = await call('create_tasks_batch', batch)
  check('same batchId is idempotent', !r.isError && r.json?.idempotent === true, r.text)

  // ── list ───────────────────────────────────────────────────────────────
  r = await call('list_tasks', { search: 'MCP-TEST', status: ['inbox', 'active'] })
  check('list_tasks finds created tasks', !r.isError && r.json.count >= 3, r.text)

  // ── complete recurring -> spawn reported ───────────────────────────────
  r = await call('complete_tasks', { ids: [alphaId] })
  const spawned = r.json?.results?.[0]?.spawnedNext
  check('complete reports spawnedNext for recurring', !r.isError && spawned?.id === domain.spawnIdFor(alphaId), r.text)
  check('spawn due = nextDue(weekly)', spawned?.due === domain.nextDue(null, 'weekly'))

  // ── reopen removes untouched spawn ─────────────────────────────────────
  r = await call('reopen_task', { id: alphaId })
  check('reopen removes untouched spawn', !r.isError && r.json?.result?.removedUntouchedSpawn === spawned.id, r.text)

  // ── delete (soft) + restore ────────────────────────────────────────────
  r = await call('delete_task', { id: createdIds[0] })
  check('delete_task ok', !r.isError && r.json?.result?.action === 'delete', r.text)
  r = await call('restore_task', { id: createdIds[0] })
  check('restore_task ok', !r.isError && r.json?.result?.action === 'restore', r.text)
  r = await call('get_task', { id: createdIds[0] })
  check('restored task is alive again', !r.isError && r.json?.task?.deletedAt === null, r.text)
  r = await call('delete_task', { id: createdIds[0] })
  check('re-delete before rollback test ok', !r.isError, r.text)

  // ── rollback of the batch ──────────────────────────────────────────────
  r = await call('rollback_operation', { opId: batchOpId })
  check('rollback of batch ok', !r.isError, r.text)
  r = await call('get_task', { id: createdIds[1] })
  check('rolled-back task is tombstoned', !r.isError && !!r.json?.task?.deletedAt, r.text)
  r = await call('rollback_operation', { opId: batchOpId })
  check('double rollback -> tool error', r.isError && /already rolled back/.test(r.text), r.text)
} finally {
  await client.close()
  fixture.cleanup()
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — ' + failures.join(', ') : ''}`)
process.exit(failed ? 1 : 0)
