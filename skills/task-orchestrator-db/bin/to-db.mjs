#!/usr/bin/env node
/**
 * to-db — safe CLI for direct SQLite management of Task Orchestrator tasks.
 *
 * Design contract (see SKILL.md and reference/SCHEMA.md):
 *  - Zero npm dependencies: uses node:sqlite (Node >= 24).
 *  - Domain logic (recurrence, spawn ids, completion side effects, notes diff,
 *    lookup GC) is imported from dist/domain.mjs — bundled from the app's own
 *    shared/core sources, auto-rebuilt when they change. No hand-copied logic.
 *  - The agent is a first-class sync device: own device_id in vector_clock,
 *    every write bumps Lamport to max(everything)+1 and appends sync_log rows,
 *    so changes propagate to other devices via the app's Google Drive sync.
 *  - Deletes are ALWAYS soft (deleted_at) — hard deletes would resurrect via
 *    state-based sync and would not propagate as deletions.
 *  - Every mutation: preflight (schema v13 + exact column check, app process
 *    check, lock file) -> VACUUM INTO backup -> BEGIN IMMEDIATE -> ops with
 *    before-images -> invariant post-check -> COMMIT -> journal append.
 *  - rollback replays before-images as a NEW forward operation (fresh lamport,
 *    sync_log entries) — sync-safe compensation, not file restore.
 *
 * Exit codes: 0 ok · 2 usage/validation · 3 schema mismatch · 4 app running /
 * locked · 5 invariant/verify failure · 6 rollback conflict · 7 internal.
 */
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import {
  readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync,
  statSync, readdirSync, unlinkSync, copyFileSync, rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

// ─── Paths & config ─────────────────────────────────────────────────────────

import { resolvePaths, readAppInstances, normalizeDbPath, appProcesses, skillRoot } from '../lib/paths.mjs'

const here = dirname(fileURLToPath(import.meta.url))
let _paths
try { _paths = resolvePaths({ DatabaseSync }) } catch (e) {
  if (e.code === 'AMBIGUOUS_DB') { console.log(JSON.stringify({ ok: false, code: 2, error: e.message }, null, 2)); process.exit(2) }
  throw e
}
const { config, dbPath: DB_PATH, dbPathSource } = _paths
const BACKUP_DIR = join(dirname(DB_PATH), 'agent-backups')
const JOURNAL_DIR = join(skillRoot, 'journal')
// Journal is keyed by DB path — rollback entries from one database must never
// be applied to another (e.g. a test copy vs the real DB).
const DB_KEY = createHash('sha1').update(DB_PATH.toLowerCase().replace(/\\/g, '/')).digest('hex').slice(0, 12)
const JOURNAL_FILE = join(JOURNAL_DIR, `ops-${DB_KEY}.jsonl`)
const STATE_FILE = join(skillRoot, 'state.json')
const LOCK_FILE = DB_PATH + '.agent-lock'
const SCHEMA_VERSION = 13

// ─── Output helpers ─────────────────────────────────────────────────────────

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n') }
function fail(code, error, extra = {}) {
  out({ ok: false, code, error, ...extra })
  process.exit(code)
}

// ─── Arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) { args.flags[a.slice(2, eq)] = a.slice(eq + 1); continue }
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { args.flags[key] = next; i++ }
      else args.flags[key] = true
    } else args._.push(a)
  }
  return args
}

// ─── Domain bundle (auto-rebuild on source change) ──────────────────────────

async function loadDomain() {
  const bundle = join(skillRoot, 'dist', 'domain.mjs')
  const manifestPath = join(skillRoot, 'dist', 'domain.manifest.json')
  let stale = !existsSync(bundle) || !existsSync(manifestPath)
  let builtAt = ''
  if (!stale) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      builtAt = manifest.builtAt
      for (const [src, mtime] of Object.entries(manifest.sources)) {
        if (!existsSync(src) || statSync(src).mtimeMs !== mtime) { stale = true; break }
      }
      if (Object.keys(manifest.sources).length === 0) stale = true
    } catch { stale = true }
  }
  if (stale) {
    const r = spawnSync(process.execPath, [join(here, 'build-domain.mjs')], { encoding: 'utf8' })
    if (r.status !== 0) fail(7, `domain bundle rebuild failed: ${r.stderr || r.stdout}`)
    builtAt = JSON.parse(readFileSync(manifestPath, 'utf8')).builtAt
  }
  return import(pathToFileURL(bundle).href + '?v=' + encodeURIComponent(builtAt))
}

// ─── Agent identity & state ─────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function agentDeviceId(domain) {
  const state = loadState()
  if (state.agentDeviceId) return state.agentDeviceId
  const id = domain.ulid()
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, agentDeviceId: id, createdAt: new Date().toISOString() }, null, 2))
  return id
}

// ─── DB open & schema preflight ─────────────────────────────────────────────

const TASK_COLUMNS = [
  'id', 'title', 'status', 'priority', 'list_name', 'due', 'recurrence',
  'flow_id', 'depends_on', 'tags', 'created_at',
  'url', 'date_start', 'estimate', 'postponed', 'rtm_series_id',
  'personas', 'completed_at', 'updated_at', 'deleted_at', 'device_id', 'lamport_ts',
]
const NOTE_COLUMNS = ['id', 'task_series_id', 'content', 'created_at', 'deleted_at', 'updated_at', 'device_id', 'lamport_ts']
const VALID_STATUSES = ['inbox', 'active', 'done', 'cancelled']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function openDb({ readonly }) {
  if (!existsSync(DB_PATH)) fail(2, `database not found: ${DB_PATH}`)
  const db = new DatabaseSync(DB_PATH, { readOnly: !!readonly, enableForeignKeyConstraints: true })
  if (!readonly) db.exec('PRAGMA busy_timeout = 5000')
  return db
}

function preflightSchema(db) {
  let version
  try {
    version = parseInt(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value || '1')
  } catch (e) { fail(3, `cannot read schema_version (${e.message}) — is this a Task Orchestrator DB?`) }
  if (version !== SCHEMA_VERSION) {
    fail(3, `schema_version is ${version}, this skill supports exactly ${SCHEMA_VERSION}. ` +
      (version < SCHEMA_VERSION
        ? 'Open the Task Orchestrator app once to run migrations, then retry.'
        : 'The app has migrated further — update the skill (review new migrations in tauri-app/src/store/migrations.ts) before writing.'))
  }
  const cols = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name)
  const missing = TASK_COLUMNS.filter(c => !cols.includes(c))
  const extra = cols.filter(c => !TASK_COLUMNS.includes(c))
  if (missing.length || extra.length) {
    fail(3, `tasks table columns drifted from what this skill knows`, { missing, extra })
  }
  const ncols = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name)
  const nMissing = NOTE_COLUMNS.filter(c => !ncols.includes(c))
  if (nMissing.length) fail(3, `notes table columns drifted`, { missing: nMissing })
}

// ─── App guard & lock (process detection lives in lib/paths.mjs) ────────────

function acquireLock(cmd) {
  const payload = JSON.stringify({ pid: process.pid, cmd, startedAt: new Date().toISOString() })
  try {
    writeFileSync(LOCK_FILE, payload, { flag: 'wx' })
    return
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
  // Lock exists — stale if its pid is dead.
  let stale = false
  try {
    const prev = JSON.parse(readFileSync(LOCK_FILE, 'utf8'))
    try { process.kill(prev.pid, 0) } catch (ke) { if (ke.code === 'ESRCH') stale = true }
    if (!stale) fail(4, `another agent operation is in progress (pid ${prev.pid}, cmd "${prev.cmd}", since ${prev.startedAt}). Retry later.`)
  } catch (e) { stale = true } // unreadable lock — reclaim
  if (stale) { unlinkSync(LOCK_FILE); writeFileSync(LOCK_FILE, payload, { flag: 'wx' }) }
}
function releaseLock() { try { unlinkSync(LOCK_FILE) } catch {} }

/**
 * Per-database write guard, driven by the instance registry (see lib/paths.mjs):
 * - an app instance (2.8+) has the TARGET DB open → its heartbeat proves it
 *   live-refreshes external changes and protects its Undo → writes are safe;
 * - running instances all use OTHER DBs → the target DB is effectively closed;
 * - app processes exist that no registry row accounts for → an old (pre-2.8)
 *   version or a still-starting instance may have the target DB open → refuse.
 */
function guardAppClosed(flags, { dryRun }) {
  const procs = appProcesses()
  if (!procs.length) return { appOpen: false, warnings: [] }
  const instances = readAppInstances({ DatabaseSync })
  const target = normalizeDbPath(DB_PATH)
  const onTarget = instances.filter(i => normalizeDbPath(i.dbPath) === target)
  if (onTarget.length) {
    return { appOpen: true, liveRefresh: true, warnings: [
      `Task Orchestrator is running with this database open (live-refresh active) — changes will appear in the app within a few seconds.`,
    ] }
  }
  // Precise accounting: a process is fine iff a registered instance claims its
  // pid (rows without pid can't vouch for a specific process — those instances
  // are counted, conservatively, only when nothing is left unaccounted).
  const claimedPids = new Set(instances.filter(i => i.pid !== null).map(i => Number(i.pid)))
  const unaccounted = procs.filter(p => !claimedPids.has(p.pid))
  const pidlessRows = instances.filter(i => i.pid === null).length
  if (unaccounted.length <= pidlessRows) {
    return { appOpen: false, warnings: [
      `Task Orchestrator is running, but on a different database (${instances.map(i => i.dbPath).join(' | ')}) — the target DB is not open in any app.`,
    ] }
  }
  if (dryRun) return { appOpen: true, warnings: [`Task Orchestrator is RUNNING (${procs.map(p => p.name).join(', ')}) — dry-run is safe, but a real write would be refused.`] }
  if (flags['force-app-open']) {
    return { appOpen: true, warnings: [
      `Task Orchestrator is RUNNING and --force-app-open was given. The app will NOT see these changes until restart/sync; ` +
      `its Undo may HARD-DELETE tasks created now; an open edit dialog may overwrite these fields on save.`,
    ] }
  }
  fail(4, `A Task Orchestrator process is running (${procs.map(p => `${p.name} pid ${p.pid}`).join(', ')}) that is not registered as a live instance — ` +
    `an old app version (pre-2.8, no live refresh) or one still starting up. It may have the target database open. ` +
    `Close or update the app, wait a few seconds and retry, or re-run with --force-app-open ONLY with the user's explicit consent. Reads are always safe.`)
}

// ─── Lamport & sync_log ─────────────────────────────────────────────────────

function nextLamport(db, agentId) {
  const m = db.prepare(`SELECT MAX(v) AS m FROM (
    SELECT COALESCE(MAX(counter),0) v FROM vector_clock
    UNION ALL SELECT COALESCE(MAX(lamport_ts),0) FROM tasks
    UNION ALL SELECT COALESCE(MAX(lamport_ts),0) FROM notes
    UNION ALL SELECT COALESCE(MAX(lamport_ts),0) FROM day_plans
    UNION ALL SELECT COALESCE(MAX(lamport_ts),0) FROM day_plan_slots
  )`).get().m || 0
  const lts = m + 1
  db.prepare(`INSERT INTO vector_clock (device_id, counter) VALUES (?, ?)
              ON CONFLICT(device_id) DO UPDATE SET counter = ?`).run(agentId, lts, lts)
  return lts
}

// ─── Row mapping (mirrors tauri-app/src/store/helpers.ts) ───────────────────

function parseJsonArr(raw, fallback = []) {
  if (!raw) return fallback
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : fallback } catch { return fallback }
}
function parseDependsOn(raw) {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p.length ? p : null
    if (typeof p === 'string' && p) return [p]
    return null
  } catch { return [raw] }
}
function rowToTask(row) {
  return {
    id: row.id, title: row.title, status: row.status, priority: row.priority,
    list: row.list_name, due: row.due, dateStart: row.date_start,
    recurrence: row.recurrence, flowId: row.flow_id,
    dependsOn: parseDependsOn(row.depends_on),
    tags: parseJsonArr(row.tags), personas: parseJsonArr(row.personas),
    url: row.url, estimate: row.estimate, postponed: row.postponed || 0,
    rtmSeriesId: row.rtm_series_id, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
    deviceId: row.device_id, lamportTs: row.lamport_ts,
  }
}
const TASK_INSERT = `INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`
function taskToRowValues(task) {
  const now = new Date().toISOString()
  return [
    task.id, task.title, task.status || 'inbox', task.priority || 4,
    task.list ?? null, task.due ?? null, task.recurrence ?? null,
    task.flowId ?? null,
    task.dependsOn?.length ? JSON.stringify(task.dependsOn) : null,
    JSON.stringify(task.tags || []),
    task.createdAt || now,
    task.url ?? null, task.dateStart ?? null, task.estimate ?? null,
    task.postponed || 0, task.rtmSeriesId ?? null,
    JSON.stringify(task.personas || []),
    task.completedAt ?? null, task.updatedAt || now, task.deletedAt ?? null,
    task.deviceId ?? null, task.lamportTs || 0,
  ]
}

// ─── Mutation context: before-images, created ids, sync_log tracking ────────

function makeCtx(db, domain, cmd, argvRaw, batchId) {
  const ctx = {
    db, domain, cmd, argv: argvRaw, batchId: batchId || null,
    opId: domain.ulid(), now: new Date().toISOString(),
    agentId: agentDeviceId(domain), lamport: 0,
    before: new Map(), notesBefore: new Map(), slotsBefore: new Map(),
    createdTasks: [], createdNotes: [], syncLogIds: [],
    warnings: [], results: [], journalExtra: {},
  }
  ctx.touchTask = (id) => {
    if (ctx.before.has(id)) return
    const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
    ctx.before.set(id, row || null)
  }
  ctx.touchNote = (id) => {
    if (ctx.notesBefore.has(id)) return
    const row = db.prepare('SELECT * FROM notes WHERE id=?').get(id)
    ctx.notesBefore.set(id, row || null)
  }
  ctx.log = (entity, entityId, action, data) => {
    const id = domain.ulid()
    db.prepare('INSERT INTO sync_log (id, entity, entity_id, action, lamport_ts, device_id, data) VALUES (?,?,?,?,?,?,?)')
      .run(id, entity, entityId, action, ctx.lamport, ctx.agentId, data != null ? JSON.stringify(data) : null)
    ctx.syncLogIds.push(id)
  }
  return ctx
}

// Storage adapter for shared handleTaskDone / handleTaskUndone (async over sync).
function makeOps(ctx) {
  const { db } = ctx
  return {
    async getTask(id) {
      const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      if (!row) return null
      return { ...row, dependsOn: parseDependsOn(row.depends_on) }
    },
    async insertTask(task) {
      ctx.touchTask(task.id)
      db.prepare(TASK_INSERT).run(...taskToRowValues(task))
      ctx.createdTasks.push(task.id)
    },
    async findInboxDependents(taskId) {
      const rows = db.prepare(
        `SELECT DISTINCT t.id, t.title, t.depends_on AS dependsOnRaw FROM tasks t, json_each(t.depends_on)
         WHERE json_each.value = ? AND t.status = 'inbox' AND t.deleted_at IS NULL AND t.depends_on IS NOT NULL`
      ).all(taskId)
      return rows.map(r => ({ id: r.id, title: r.title, dependsOn: r.dependsOnRaw ? JSON.parse(r.dependsOnRaw) : [] }))
    },
    async isBlockerActive(taskId) {
      return !!db.prepare("SELECT id FROM tasks WHERE id = ? AND status != 'done' AND deleted_at IS NULL").get(taskId)
    },
    async activateTask(id, lts, did) {
      ctx.touchTask(id)
      db.prepare("UPDATE tasks SET status='active', updated_at=?, lamport_ts=?, device_id=? WHERE id=?")
        .run(new Date().toISOString(), lts, did, id)
      ctx.log('tasks', id, 'update', { status: 'active' })
    },
    async softDeleteTask(id, lts, did) {
      ctx.touchTask(id)
      const now = new Date().toISOString()
      db.prepare('UPDATE tasks SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?')
        .run(now, now, lts, did, id)
      ctx.log('tasks', id, 'update', { deletedAt: now })
    },
    async resurrectTask(task) {
      ctx.touchTask(task.id)
      const cols = TASK_COLUMNS.filter(c => c !== 'id')
      const vals = taskToRowValues(task).slice(1)
      db.prepare(`UPDATE tasks SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...vals, task.id)
      ctx.log('tasks', task.id, 'update', task)
    },
  }
}

// Note adapter for shared saveNotes (mirrors store/noteAdapter.ts).
function makeNoteAdapter(ctx) {
  const { db, domain } = ctx
  return {
    async getSeriesId(taskId) {
      const row = db.prepare('SELECT rtm_series_id FROM tasks WHERE id=?').get(taskId)
      return row?.rtm_series_id || taskId
    },
    async selectAliveNotes(seriesId) {
      return db.prepare('SELECT * FROM notes WHERE task_series_id=? AND deleted_at IS NULL').all(seriesId)
        .map(r => ({
          id: r.id, taskSeriesId: r.task_series_id, content: r.content || '',
          createdAt: Number(r.created_at) || 0, updatedAt: r.updated_at || null,
          deletedAt: r.deleted_at || null, lamportTs: Number(r.lamport_ts) || 0, deviceId: r.device_id || null,
        }))
    },
    async softDeleteNote(id, now, lts, did) {
      ctx.touchNote(id)
      db.prepare('UPDATE notes SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?').run(now, now, lts, did, id)
    },
    async upsertNote(n) {
      ctx.touchNote(n.id)
      const existed = !!db.prepare('SELECT id FROM notes WHERE id=?').get(n.id)
      db.prepare('INSERT OR REPLACE INTO notes (id, task_series_id, content, created_at, deleted_at, updated_at, lamport_ts, device_id) VALUES (?,?,?,?,NULL,?,?,?)')
        .run(n.id, n.taskSeriesId, n.content || '', n.createdAt, n.updatedAt || null, n.lamportTs, n.deviceId)
      if (!existed) ctx.createdNotes.push(n.id)
    },
    getDeviceId() { return ctx.agentId },
    async nextLamport() { return ctx.lamport },
    now() { return new Date().toISOString() },
    generateId() { return domain.ulid() },
    async logDeleteNote(noteId, seriesId, deletedAt, lts, did) {
      ctx.log('notes', noteId, 'delete', { deletedAt, taskSeriesId: seriesId })
    },
    async logUpsertNote(n) {
      ctx.log('notes', n.id, 'insert', { content: n.content, createdAt: n.createdAt })
    },
  }
}

// ─── Field validation ───────────────────────────────────────────────────────

const WRITABLE_FIELDS = new Set([
  'title', 'status', 'priority', 'list', 'due', 'dateStart', 'recurrence',
  'flowId', 'dependsOn', 'tags', 'personas', 'url', 'estimate', 'postponed', 'notes',
])

function validateChanges(db, changes, { forAdd, taskId }) {
  const errors = []
  for (const key of Object.keys(changes)) {
    if (!WRITABLE_FIELDS.has(key)) errors.push(`unknown field "${key}" (writable: ${[...WRITABLE_FIELDS].join(', ')})`)
  }
  const c = changes
  if (forAdd && (typeof c.title !== 'string' || !c.title.trim())) errors.push('title is required and must be a non-empty string')
  if (!forAdd && 'title' in c && (typeof c.title !== 'string' || !c.title.trim())) errors.push('title must be a non-empty string')
  if ('status' in c && !VALID_STATUSES.includes(c.status)) errors.push(`status must be one of ${VALID_STATUSES.join('|')}`)
  if ('priority' in c && ![1, 2, 3, 4].includes(c.priority)) errors.push('priority must be 1|2|3|4 (number)')
  for (const f of ['due', 'dateStart']) {
    if (f in c && c[f] !== null && !(typeof c[f] === 'string' && ISO_DATE.test(c[f])))
      errors.push(`${f} must be null or "YYYY-MM-DD" (got ${JSON.stringify(c[f])}) — convert natural language to ISO yourself`)
  }
  if ('recurrence' in c && c.recurrence !== null) {
    const r = String(c.recurrence).trim()
    if (!/^(daily|weekly|monthly|yearly)$/i.test(r) && !/^(RRULE:)?FREQ=/i.test(r))
      errors.push('recurrence must be null, "daily"|"weekly"|"monthly"|"yearly", or an RRULE string starting with FREQ=')
    else c.recurrence = /^(daily|weekly|monthly|yearly)$/i.test(r) ? r.toLowerCase() : r
  }
  for (const f of ['list', 'flowId', 'url', 'estimate']) {
    if (f in c && c[f] !== null && (typeof c[f] !== 'string' || !c[f].trim())) errors.push(`${f} must be null or a non-empty string`)
  }
  for (const f of ['tags', 'personas']) {
    if (f in c) {
      if (!Array.isArray(c[f]) || c[f].some(x => typeof x !== 'string' || !x.trim())) errors.push(`${f} must be an array of non-empty strings`)
      else c[f] = [...new Set(c[f].map(s => s.trim()))]
    }
  }
  if ('postponed' in c && (!Number.isInteger(c.postponed) || c.postponed < 0)) errors.push('postponed must be a non-negative integer')
  if ('notes' in c && c.notes !== null) {
    if (!Array.isArray(c.notes) || c.notes.some(n => !n || typeof n.content !== 'string'))
      errors.push('notes must be an array of { content, id?, createdAt? } — it REPLACES the full note list (omitted notes are deleted)')
  }
  if ('dependsOn' in c && c.dependsOn !== null) {
    if (!Array.isArray(c.dependsOn) || c.dependsOn.some(x => typeof x !== 'string')) {
      errors.push('dependsOn must be null or an array of task ids')
    } else {
      c.dependsOn = [...new Set(c.dependsOn)]
      for (const depId of c.dependsOn) {
        if (taskId && depId === taskId) { errors.push('dependsOn must not reference the task itself'); continue }
        const dep = db.prepare('SELECT id, deleted_at FROM tasks WHERE id=?').get(depId)
        if (!dep) errors.push(`dependsOn references missing task ${depId}`)
        else if (dep.deleted_at) errors.push(`dependsOn references deleted task ${depId}`)
      }
      if (taskId) {
        const all = db.prepare('SELECT id, depends_on FROM tasks WHERE deleted_at IS NULL').all()
          .map(r => ({ id: r.id, dependsOn: parseDependsOn(r.depends_on) }))
        const self = all.find(t => t.id === taskId)
        if (self) self.dependsOn = c.dependsOn
        // wouldCreateCycle checked per new edge, like the app's edit dialog
      }
    }
  }
  return errors
}

function checkCycles(db, domain, taskId, deps) {
  const all = db.prepare('SELECT id, depends_on FROM tasks WHERE deleted_at IS NULL').all()
    .map(r => ({ id: r.id, dependsOn: r.id === taskId ? [] : parseDependsOn(r.depends_on) }))
  const errors = []
  const self = all.find(t => t.id === taskId) || (all.push({ id: taskId, dependsOn: [] }), all[all.length - 1])
  for (const depId of deps || []) {
    if (domain.wouldCreateCycle(all, taskId, depId)) errors.push(`dependsOn ${depId} would create a dependency cycle`)
    self.dependsOn = [...self.dependsOn, depId]
  }
  return errors
}

// ─── Core mutations (mirror useTauriTaskStore write patterns) ───────────────

function upsertLookup(ctx, kind, name, logIt) {
  const changed = ctx.db.prepare(`INSERT OR IGNORE INTO ${kind} VALUES (?)`).run(name).changes
  if (changed && logIt) ctx.log(kind, name, 'insert', { name })
}

async function doAdd(ctx, data) {
  const { db, domain } = ctx
  const errors = validateChanges(db, data, { forAdd: true })
  if (errors.length) throw new OpError(2, errors)
  const dup = db.prepare('SELECT id FROM tasks WHERE title=? AND deleted_at IS NULL').get(data.title.trim())
  if (dup) ctx.warnings.push(`a live task with the same title already exists: ${dup.id} "${data.title.trim()}"`)

  const task = {
    id: domain.ulid(), title: data.title.trim(), status: data.status || 'inbox',
    priority: data.priority || 4, list: data.list || null,
    due: data.due || null, recurrence: data.recurrence || null,
    flowId: data.flowId || null, dependsOn: data.dependsOn?.length ? data.dependsOn : null,
    tags: data.tags || [], personas: data.personas || [],
    url: data.url || null, dateStart: data.dateStart || null,
    estimate: data.estimate || null, postponed: data.postponed || 0, rtmSeriesId: null,
    completedAt: data.status === 'done' ? ctx.now : null,
    createdAt: ctx.now, updatedAt: ctx.now, deletedAt: null,
    lamportTs: ctx.lamport, deviceId: ctx.agentId,
  }
  if (task.dependsOn) {
    const cyc = checkCycles(db, domain, task.id, task.dependsOn)
    if (cyc.length) throw new OpError(2, cyc)
  }
  ctx.touchTask(task.id)
  db.prepare(TASK_INSERT).run(...taskToRowValues(task))
  ctx.createdTasks.push(task.id)
  ctx.log('tasks', task.id, 'insert', task)
  if (task.list) upsertLookup(ctx, 'lists', task.list, true)
  for (const t of task.tags) upsertLookup(ctx, 'tags', t, true)
  for (const p of task.personas) upsertLookup(ctx, 'personas', p, true)
  if (task.flowId) upsertLookup(ctx, 'flows', task.flowId, true)
  if (Array.isArray(data.notes) && data.notes.length) {
    await domain.saveNotes(makeNoteAdapter(ctx), task.id, data.notes, { overrideLts: ctx.lamport, overrideDid: ctx.agentId })
  }
  return { action: 'add', id: task.id, title: task.title, status: task.status }
}

class OpError extends Error {
  constructor(code, errors) { super(Array.isArray(errors) ? errors.join('; ') : String(errors)); this.code = code; this.errors = errors }
}

const COL = {
  title: 'title', status: 'status', priority: 'priority', list: 'list_name',
  due: 'due', recurrence: 'recurrence', flowId: 'flow_id', dependsOn: 'depends_on',
  url: 'url', dateStart: 'date_start', estimate: 'estimate', postponed: 'postponed',
  tags: 'tags', personas: 'personas',
}

async function doUpdate(ctx, id, changes, opts = {}) {
  const { db, domain } = ctx
  const prevRow = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
  if (!prevRow) throw new OpError(2, [`task ${id} not found`])
  if (prevRow.deleted_at && !opts.allowDeleted) throw new OpError(2, [`task ${id} is deleted — use action "restore" first`])
  const errors = validateChanges(db, changes, { forAdd: false, taskId: id })
  if (errors.length) throw new OpError(2, errors)
  if ('dependsOn' in changes && changes.dependsOn) {
    const cyc = checkCycles(db, domain, id, changes.dependsOn)
    if (cyc.length) throw new OpError(2, cyc)
  }
  const prevStatus = prevRow.status

  // Completing a blocked task: refuse (explicit) unless the batch says skip.
  if (changes.status === 'done' && prevStatus !== 'done') {
    const blocked = await domain.isTaskBlocked(makeOps(ctx), id)
    if (blocked) {
      const deps = parseDependsOn(prevRow.depends_on) || []
      const open = deps.filter(d => db.prepare("SELECT 1 FROM tasks WHERE id=? AND status!='done' AND deleted_at IS NULL").get(d))
      if (opts.skipBlocked) {
        ctx.warnings.push(`skipped complete of ${id} "${prevRow.title}" — blocked by: ${open.join(', ')}`)
        return { action: 'update', id, skipped: 'blocked', blockedBy: open }
      }
      throw new OpError(2, [`task ${id} "${prevRow.title}" is blocked by unfinished dependencies: ${open.join(', ')}. Complete them first (earlier in the same batch works) or pass --skip-blocked.`])
    }
  }

  ctx.touchTask(id)
  const sets = [], vals = []
  for (const [key, val] of Object.entries(changes)) {
    const col = COL[key]
    if (!col) continue // notes handled below
    sets.push(`${col} = ?`)
    vals.push(
      key === 'due' || key === 'dateStart' ? (val && ISO_DATE.test(val) ? val : null) :
      key === 'tags' || key === 'personas' ? JSON.stringify(val ?? []) :
      key === 'dependsOn' ? (Array.isArray(val) && val.length ? JSON.stringify(val) : null) :
      (val ?? null)
    )
  }
  sets.push('updated_at = ?'); vals.push(ctx.now)
  sets.push('lamport_ts = ?'); vals.push(ctx.lamport)
  sets.push('device_id = ?'); vals.push(ctx.agentId)
  // completed_at rules: set on transition to done, keep on done->done, clear when leaving done
  if (changes.status === 'done' && prevStatus !== 'done') { sets.push('completed_at = ?'); vals.push(ctx.now) }
  else if (changes.status && changes.status !== 'done') { sets.push('completed_at = NULL') }
  vals.push(id)
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

  if (changes.list) upsertLookup(ctx, 'lists', changes.list, false)
  if (changes.tags) for (const t of changes.tags) upsertLookup(ctx, 'tags', t, false)
  if (changes.personas) for (const p of changes.personas) upsertLookup(ctx, 'personas', p, false)
  if (changes.flowId) upsertLookup(ctx, 'flows', changes.flowId, false)

  const result = { action: 'update', id, changed: Object.keys(changes) }
  if (changes.status === 'done' && prevStatus !== 'done') {
    const doneResult = await domain.handleTaskDone(makeOps(ctx), id, domain.ulid, ctx.lamport, ctx.agentId, prevStatus)
    if (doneResult.spawned && !doneResult.resurrected) ctx.log('tasks', doneResult.spawned.id, 'insert', doneResult.spawned)
    if (doneResult.spawned) result.spawnedNext = { id: doneResult.spawned.id, due: doneResult.spawned.due, resurrected: doneResult.resurrected }
    if (doneResult.activated.length) result.activatedDependents = doneResult.activated
  } else if (prevStatus === 'done' && changes.status && changes.status !== 'done') {
    const undone = await domain.handleTaskUndone(makeOps(ctx), id, ctx.lamport, ctx.agentId)
    if (undone.removedSpawn) result.removedUntouchedSpawn = undone.removedSpawn
  }

  if (changes.notes !== undefined) {
    await domain.saveNotes(makeNoteAdapter(ctx), id, changes.notes || [], { overrideLts: ctx.lamport, overrideDid: ctx.agentId })
    result.notesSaved = (changes.notes || []).length
  }
  ctx.log('tasks', id, 'update', changes)
  return result
}

function lookupGc(ctx) {
  const { db } = ctx
  db.exec(`DELETE FROM lists WHERE name NOT IN (SELECT DISTINCT list_name FROM tasks WHERE list_name IS NOT NULL AND deleted_at IS NULL)`)
  db.exec(`DELETE FROM flows WHERE name NOT IN (SELECT DISTINCT flow_id FROM tasks WHERE flow_id IS NOT NULL AND deleted_at IS NULL) AND name NOT IN (SELECT name FROM flow_meta)`)
  db.exec(`DELETE FROM tags WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.tags) WHERE tasks.deleted_at IS NULL)`)
  db.exec(`DELETE FROM personas WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.personas) WHERE tasks.deleted_at IS NULL)`)
}

function doDelete(ctx, id) {
  const { db } = ctx
  const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
  if (!row) throw new OpError(2, [`task ${id} not found`])
  if (row.deleted_at) { ctx.warnings.push(`task ${id} is already deleted — no-op`); return { action: 'delete', id, noop: true } }
  ctx.touchTask(id)
  db.prepare('UPDATE tasks SET deleted_at=?, lamport_ts=?, device_id=?, updated_at=? WHERE id=?')
    .run(ctx.now, ctx.lamport, ctx.agentId, ctx.now, id)
  ctx.log('tasks', id, 'delete', null)
  // Planner slots for the deleted task are hard-removed (matches app bulkDelete)
  for (const slot of db.prepare('SELECT * FROM day_plan_slots WHERE task_id=?').all(id)) {
    if (!ctx.slotsBefore.has(slot.id)) ctx.slotsBefore.set(slot.id, slot)
  }
  db.prepare('DELETE FROM day_plan_slots WHERE task_id=?').run(id)
  return { action: 'delete', id, title: row.title }
}

function doRestore(ctx, id) {
  const { db } = ctx
  const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
  if (!row) throw new OpError(2, [`task ${id} not found`])
  if (!row.deleted_at) { ctx.warnings.push(`task ${id} is not deleted — no-op`); return { action: 'restore', id, noop: true } }
  ctx.touchTask(id)
  db.prepare('UPDATE tasks SET deleted_at=NULL, updated_at=?, lamport_ts=?, device_id=? WHERE id=?')
    .run(ctx.now, ctx.lamport, ctx.agentId, id)
  ctx.log('tasks', id, 'update', { deletedAt: null })
  const t = rowToTask(row)
  if (t.list) upsertLookup(ctx, 'lists', t.list, false)
  for (const tag of t.tags) upsertLookup(ctx, 'tags', tag, false)
  for (const p of t.personas) upsertLookup(ctx, 'personas', p, false)
  if (t.flowId) upsertLookup(ctx, 'flows', t.flowId, false)
  return { action: 'restore', id, title: row.title }
}

// ─── Invariant post-check (runs INSIDE the transaction, before COMMIT) ──────

function checkInvariants(db, domain) {
  const errors = [], warnings = []
  const bad = (sql, msg, sev = errors) => {
    const rows = db.prepare(sql).all()
    if (rows.length) sev.push({ problem: msg, rows: rows.slice(0, 10) })
  }
  bad(`SELECT id, status FROM tasks WHERE status NOT IN ('inbox','active','done','cancelled')`, 'invalid status')
  bad(`SELECT id, priority FROM tasks WHERE priority NOT IN (1,2,3,4)`, 'invalid priority')
  bad(`SELECT id, title FROM tasks WHERE title IS NULL OR title = ''`, 'empty title')
  bad(`SELECT id, due FROM tasks WHERE due IS NOT NULL AND due NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`, 'malformed due date')
  bad(`SELECT id, date_start FROM tasks WHERE date_start IS NOT NULL AND date_start NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`, 'malformed date_start')
  bad(`SELECT id FROM tasks WHERE json_valid(tags) = 0 OR json_type(tags) != 'array'`, 'tags is not a JSON array')
  bad(`SELECT id FROM tasks WHERE json_valid(personas) = 0 OR json_type(personas) != 'array'`, 'personas is not a JSON array')
  bad(`SELECT id FROM tasks WHERE depends_on IS NOT NULL AND (json_valid(depends_on) = 0 OR json_type(depends_on) != 'array' OR json_array_length(depends_on) = 0)`, 'depends_on must be NULL or a non-empty JSON array')
  bad(`SELECT t.id, je.value AS missing_dep FROM tasks t, json_each(t.depends_on) je
       WHERE t.depends_on IS NOT NULL AND t.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM tasks d WHERE d.id = je.value)`, 'depends_on references a non-existent task')
  bad(`SELECT id, status FROM tasks WHERE status='done' AND completed_at IS NULL AND deleted_at IS NULL`, 'done task without completed_at', warnings)
  bad(`SELECT id, status FROM tasks WHERE status!='done' AND completed_at IS NOT NULL AND deleted_at IS NULL`, 'non-done task with completed_at', warnings)
  bad(`SELECT s.id, s.task_id FROM day_plan_slots s JOIN tasks t ON t.id = s.task_id WHERE t.deleted_at IS NOT NULL`, 'planner slot points at a deleted task', warnings)
  // Dependency cycles among live tasks
  const live = db.prepare('SELECT id, depends_on FROM tasks WHERE deleted_at IS NULL').all()
    .map(r => ({ id: r.id, dependsOn: parseDependsOn(r.depends_on) }))
  const withDeps = live.filter(t => t.dependsOn?.length)
  for (const t of withDeps) {
    for (const dep of t.dependsOn) {
      const others = live.map(x => x.id === t.id ? { ...x, dependsOn: x.dependsOn.filter(d => d !== dep) } : x)
      if (domain.wouldCreateCycle(others, t.id, dep)) { errors.push({ problem: 'dependency cycle', rows: [{ id: t.id, dep }] }); break }
    }
  }
  // Duplicate live active recurring instances per rtm series
  const dupes = domain.findRecurringDuplicates(db.prepare('SELECT id, rtm_series_id, recurrence, status, created_at, deleted_at FROM tasks').all())
  if (dupes.length) warnings.push({ problem: 'duplicate active recurring instances (app would soft-delete extras)', rows: dupes.slice(0, 10) })
  // Lamport sanity: no row ahead of the vector clock
  bad(`SELECT id, lamport_ts FROM tasks WHERE lamport_ts > (SELECT COALESCE(MAX(counter),0) FROM vector_clock)`, 'task lamport_ts ahead of vector_clock')
  const fk = db.prepare('PRAGMA foreign_key_check').all()
  if (fk.length) errors.push({ problem: 'foreign key violations', rows: fk.slice(0, 10) })
  const qc = db.prepare('PRAGMA quick_check').get()
  if (qc.quick_check !== 'ok') errors.push({ problem: `quick_check: ${qc.quick_check}` })
  return { errors, warnings }
}

// ─── Backup & journal ───────────────────────────────────────────────────────

function makeBackup(db, label) {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(BACKUP_DIR, `pre-${ts}-${label}.db`)
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''").replace(/\\/g, '/')}'`)
  // Rotate
  const backups = readdirSync(BACKUP_DIR).filter(f => f.startsWith('pre-') && f.endsWith('.db')).sort().reverse()
  for (const old of backups.slice(config.backupKeep || 15)) {
    try { unlinkSync(join(BACKUP_DIR, old)) } catch {}
  }
  return file
}

function journalAppend(entry) {
  mkdirSync(JOURNAL_DIR, { recursive: true })
  appendFileSync(JOURNAL_FILE, JSON.stringify(entry) + '\n')
  // Rotation: before-images make the journal grow — when it exceeds the cap,
  // keep the newest half of the entries. Rolling back an op older than that is
  // rare; the file backups in agent-backups/ remain the deep safety net.
  const maxBytes = parseInt(process.env.TO_DB_JOURNAL_MAX || '') || config.journalMaxBytes || 5_000_000
  try {
    if (statSync(JOURNAL_FILE).size > maxBytes) {
      const lines = readFileSync(JOURNAL_FILE, 'utf8').split('\n').filter(Boolean)
      writeFileSync(JOURNAL_FILE, lines.slice(Math.ceil(lines.length / 2)).join('\n') + '\n')
    }
  } catch {}
}
function journalRead() {
  if (!existsSync(JOURNAL_FILE)) return []
  return readFileSync(JOURNAL_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

// ─── Mutating command wrapper ───────────────────────────────────────────────

async function runMutation(cmd, flags, argvRaw, body, { contentHash = null } = {}) {
  const domain = await loadDomain()
  const dryRun = !!flags['dry-run']
  const db = openDb({ readonly: false })
  preflightSchema(db)
  const guard = guardAppClosed(flags, { dryRun })

  // Idempotency: a batch that already succeeded is not applied twice. A reused
  // batch-id with DIFFERENT content is an error, not a silent skip.
  const batchId = flags['batch-id'] || null
  if (batchId && !dryRun) {
    const prior = journalRead().find(e => e.batchId === batchId && e.ok)
    if (prior) {
      if (prior.contentHash && contentHash && prior.contentHash !== contentHash) {
        db.close()
        fail(2, `batch-id "${batchId}" was already applied at ${prior.ts} with DIFFERENT content — use a new batch-id for new operations.`)
      }
      out({ ok: true, idempotent: true, opId: prior.opId, note: `batch-id "${batchId}" already applied at ${prior.ts}` })
      db.close()
      return
    }
  }

  acquireLock(cmd)
  let backupFile = null
  const ctx = makeCtx(db, domain, cmd, argvRaw, batchId)
  ctx.warnings.push(...guard.warnings)
  let opError = null
  try {
    if (!dryRun) backupFile = makeBackup(db, ctx.opId)
    db.exec('BEGIN IMMEDIATE')
    let committed = false
    try {
      ctx.lamport = nextLamport(db, ctx.agentId)
      // Baseline BEFORE ops: pre-existing data issues must not block the agent —
      // only problems INTRODUCED by this operation abort it.
      const preInv = checkInvariants(db, domain)
      await body(ctx)
      lookupGc(ctx)
      const postInv = checkInvariants(db, domain)
      const invKey = (e) => e.problem + '|' + JSON.stringify((e.rows || []).map(r => r.id ?? r).sort())
      const preKeys = new Set(preInv.errors.map(invKey))
      const newErrors = postInv.errors.filter(e => !preKeys.has(invKey(e)))
      if (newErrors.length) throw new OpError(5, ['invariant check failed after applying ops — rolled back: ' + JSON.stringify(newErrors)])
      if (preInv.errors.length) ctx.warnings.push(`pre-existing data issues (NOT caused by this op, see "verify"): ${preInv.errors.map(e => e.problem).join('; ')}`)
      ctx.warnings.push(...postInv.warnings.map(w => `invariant warning: ${w.problem}`))
      if (dryRun) {
        db.exec('ROLLBACK')
      } else {
        db.exec('COMMIT')
        committed = true
      }
    } catch (e) {
      try { db.exec('ROLLBACK') } catch {}
      throw e
    }
    if (committed) {
      if (!guard.appOpen) { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch {} }
      journalAppend({
        ok: true, opId: ctx.opId, batchId, contentHash, ts: ctx.now, cmd, argv: argvRaw,
        lamport: ctx.lamport, agentDeviceId: ctx.agentId, backupFile,
        ...ctx.journalExtra,
        tasksBefore: [...ctx.before.entries()].map(([id, row]) => row ?? { id, __absent: true }),
        notesBefore: [...ctx.notesBefore.entries()].map(([id, row]) => row ?? { id, __absent: true }),
        slotsBefore: [...ctx.slotsBefore.values()],
        createdTasks: ctx.createdTasks, createdNotes: ctx.createdNotes,
        syncLogIds: ctx.syncLogIds,
        summary: ctx.results,
      })
    }
    out({
      ok: true, dryRun: dryRun || undefined, opId: dryRun ? undefined : ctx.opId,
      lamport: ctx.lamport, backup: backupFile || undefined,
      results: ctx.results, warnings: ctx.warnings.length ? ctx.warnings : undefined,
      rollbackHint: dryRun ? undefined : `node "${join(here, 'to-db.mjs')}" rollback --op ${ctx.opId}`,
    })
  } catch (e) {
    if (e instanceof OpError) opError = e
    else throw e
  } finally {
    releaseLock()
    db.close()
  }
  if (opError) fail(opError.code, opError.message)
}

// ─── Batch op dispatch ──────────────────────────────────────────────────────

async function applyOps(ctx, ops, flags) {
  if (!Array.isArray(ops) || !ops.length) throw new OpError(2, ['ops must be a non-empty array'])
  const max = config.maxBatchOps || 200
  if (ops.length > max && !flags['allow-large']) throw new OpError(2, [`batch has ${ops.length} ops (max ${max}) — split it or pass --allow-large`])
  const deletes = ops.filter(o => o.action === 'delete').length
  const alive = ctx.db.prepare('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL').get().c
  const threshold = config.massDeleteThreshold || 20
  // "Mass" = above the absolute threshold, or a large share of the DB — but a
  // handful of deletes is never mass, even in a tiny database.
  if ((deletes > threshold || (deletes >= 5 && alive > 0 && deletes / alive > 0.3)) && !flags['confirm-mass-delete'])
    throw new OpError(2, [`batch deletes ${deletes} of ${alive} live tasks — confirm with the user first, then pass --confirm-mass-delete`])

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    try {
      let r
      switch (op.action) {
        case 'add': r = await doAdd(ctx, op.task || {}); break
        case 'update': r = await doUpdate(ctx, op.id, op.changes || {}, { skipBlocked: !!flags['skip-blocked'] }); break
        case 'set-status': r = await doUpdate(ctx, op.id, { status: op.status }, { skipBlocked: !!flags['skip-blocked'] }); break
        case 'complete': r = await doUpdate(ctx, op.id, { status: 'done' }, { skipBlocked: !!flags['skip-blocked'] }); break
        case 'reopen': r = await doUpdate(ctx, op.id, { status: 'active' }); break
        case 'delete': r = doDelete(ctx, op.id); break
        case 'restore': r = doRestore(ctx, op.id); break
        default: throw new OpError(2, [`unknown action "${op.action}" (add|update|set-status|complete|reopen|delete|restore)`])
      }
      ctx.results.push({ op: i, ...r })
    } catch (e) {
      if (e instanceof OpError) throw new OpError(e.code, [`op[${i}] (${op.action} ${op.id || ''}): ${e.message}`])
      throw e
    }
  }
}

function readJsonInput(flags) {
  if (flags.json) { try { return JSON.parse(flags.json) } catch (e) { fail(2, `--json is not valid JSON: ${e.message}`) } }
  if (flags.file) {
    if (!existsSync(flags.file)) fail(2, `--file not found: ${flags.file}`)
    try { return JSON.parse(readFileSync(flags.file, 'utf8')) } catch (e) { fail(2, `--file is not valid JSON: ${e.message}`) }
  }
  return null
}

// Sugar flags -> task/changes object
function collectFieldFlags(flags) {
  const o = {}
  const map = {
    title: 'title', status: 'status', list: 'list', due: 'due',
    'date-start': 'dateStart', recurrence: 'recurrence', flow: 'flowId',
    url: 'url', estimate: 'estimate',
  }
  for (const [flag, key] of Object.entries(map)) {
    if (flag in flags) o[key] = flags[flag] === 'null' ? null : flags[flag]
  }
  if ('priority' in flags) o.priority = parseInt(flags.priority)
  if ('tags' in flags) o.tags = flags.tags === 'null' ? [] : String(flags.tags).split(',').map(s => s.trim()).filter(Boolean)
  if ('personas' in flags) o.personas = flags.personas === 'null' ? [] : String(flags.personas).split(',').map(s => s.trim()).filter(Boolean)
  if ('depends-on' in flags) o.dependsOn = flags['depends-on'] === 'null' ? null : String(flags['depends-on']).split(',').map(s => s.trim()).filter(Boolean)
  if ('note' in flags) o.notes = [{ content: String(flags.note) }]
  return o
}

// ─── Read commands ──────────────────────────────────────────────────────────

const LIST_FIELDS = 'id,title,status,priority,list_name,due,date_start,recurrence,flow_id,depends_on,tags,personas,url,estimate,postponed,rtm_series_id,completed_at,created_at,updated_at,deleted_at'

function cmdList(flags) {
  const db = openDb({ readonly: true })
  preflightSchema(db)
  const where = [], params = []
  if (!flags['include-deleted']) where.push('deleted_at IS NULL')
  if (flags.status) { where.push(`status IN (${String(flags.status).split(',').map(() => '?').join(',')})`); params.push(...String(flags.status).split(',')) }
  if (flags.list) { where.push('list_name = ?'); params.push(flags.list) }
  if (flags.flow) { where.push('flow_id = ?'); params.push(flags.flow) }
  if (flags.tag) { where.push(`EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE value = ?)`); params.push(flags.tag) }
  if (flags.persona) { where.push(`EXISTS (SELECT 1 FROM json_each(tasks.personas) WHERE value = ?)`); params.push(flags.persona) }
  if (flags.search) { where.push('title LIKE ? COLLATE NOCASE'); params.push(`%${flags.search}%`) }
  if (flags['due-before']) { where.push('due IS NOT NULL AND due <= ?'); params.push(flags['due-before']) }
  if (flags['due-after']) { where.push('due IS NOT NULL AND due >= ?'); params.push(flags['due-after']) }
  if (flags.recurring) where.push('recurrence IS NOT NULL')
  if (flags.overdue) { where.push("due IS NOT NULL AND due < ? AND status IN ('inbox','active')"); params.push(new Date().toISOString().slice(0, 10)) }
  const limit = parseInt(flags.limit || '500')
  const rows = db.prepare(
    `SELECT ${LIST_FIELDS} FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY priority, due IS NULL, due, created_at LIMIT ?`
  ).all(...params, limit)
  db.close()
  out({ ok: true, count: rows.length, tasks: rows.map(rowToTask) })
}

function cmdGet(flags, id) {
  if (!id) fail(2, 'usage: get <taskId>')
  const db = openDb({ readonly: true })
  preflightSchema(db)
  const row = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
  if (!row) { db.close(); fail(2, `task ${id} not found`) }
  const task = rowToTask(row)
  const seriesId = row.rtm_series_id || row.id
  const noteTs = (v) => {
    const n = Number(v)
    const ms = Number.isFinite(n) ? n : Date.parse(String(v))
    return Number.isFinite(ms) ? new Date(ms).toISOString() : String(v)
  }
  task.notes = db.prepare('SELECT id, content, created_at FROM notes WHERE task_series_id=? AND deleted_at IS NULL ORDER BY created_at').all(seriesId)
    .map(n => ({ id: n.id, content: n.content, createdAt: noteTs(n.created_at) }))
  const dependents = db.prepare(
    `SELECT t.id, t.title, t.status FROM tasks t, json_each(t.depends_on) WHERE json_each.value = ? AND t.deleted_at IS NULL`
  ).all(id)
  const blockers = (task.dependsOn || []).map(d => {
    const b = db.prepare('SELECT id, title, status, deleted_at FROM tasks WHERE id=?').get(d)
    return b ? { id: b.id, title: b.title, status: b.status, deleted: !!b.deleted_at } : { id: d, missing: true }
  })
  const slots = db.prepare(`SELECT s.id, p.date, s.start_time, s.end_time FROM day_plan_slots s JOIN day_plans p ON p.id = s.plan_id WHERE s.task_id = ?`).all(id)
  db.close()
  out({ ok: true, task, dependents, blockers, plannerSlots: slots })
}

function cmdStatus() {
  const db = openDb({ readonly: true })
  let schemaOk = true, schemaVersion = null
  try {
    schemaVersion = parseInt(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value || '1')
    schemaOk = schemaVersion === SCHEMA_VERSION
  } catch { schemaOk = false }
  const counts = {
    alive: db.prepare('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NULL').get().c,
    deleted: db.prepare('SELECT COUNT(*) c FROM tasks WHERE deleted_at IS NOT NULL').get().c,
    byStatus: Object.fromEntries(db.prepare("SELECT status, COUNT(*) c FROM tasks WHERE deleted_at IS NULL GROUP BY status").all().map(r => [r.status, r.c])),
    notes: db.prepare('SELECT COUNT(*) c FROM notes WHERE deleted_at IS NULL').get().c,
  }
  const vc = db.prepare('SELECT device_id, counter FROM vector_clock ORDER BY counter DESC').all()
  const appDeviceId = db.prepare("SELECT value FROM meta WHERE key='device_id'").get()?.value || null
  const gdrive = !!db.prepare("SELECT value FROM meta WHERE key='gdrive_refresh_token'").get()?.value
  const lastSync = db.prepare("SELECT value FROM meta WHERE key='last_sync'").get()?.value || null
  const qc = db.prepare('PRAGMA quick_check').get().quick_check
  db.close()
  const state = loadState()
  const journal = journalRead()
  const lastOp = journal.length ? journal[journal.length - 1] : null
  let backups = []
  try { backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse().slice(0, 3) } catch {}
  const instances = readAppInstances({ DatabaseSync })
  const target = normalizeDbPath(DB_PATH)
  out({
    ok: true, dbPath: DB_PATH, dbPathSource, schemaVersion, schemaOk,
    appRunning: appProcesses(), lockPresent: existsSync(LOCK_FILE),
    appInstances: instances.map(i => ({ ...i, onThisDb: normalizeDbPath(i.dbPath) === target })),
    counts, vectorClock: vc, appDeviceId, agentDeviceId: state.agentDeviceId || '(created on first write)',
    googleDriveConnected: gdrive, lastSync, integrity: qc,
    lastAgentOp: lastOp ? { opId: lastOp.opId, cmd: lastOp.cmd, ts: lastOp.ts } : null,
    recentBackups: backups,
  })
}

async function cmdVerify(flags) {
  const domain = await loadDomain()
  const db = openDb({ readonly: true })
  preflightSchema(db)
  const inv = checkInvariants(db, domain)
  if (flags.deep) {
    const rows = db.prepare('PRAGMA integrity_check').all()
    if (!(rows.length === 1 && rows[0].integrity_check === 'ok')) inv.errors.push({ problem: 'integrity_check failed', rows })
  }
  db.close()
  if (inv.errors.length) { out({ ok: false, code: 5, errors: inv.errors, warnings: inv.warnings }); process.exit(5) }
  out({ ok: true, errors: [], warnings: inv.warnings })
}

// ─── Rollback (sync-safe forward compensation from journal before-images) ───

const BOOKKEEPING = new Set(['lamport_ts', 'device_id'])

async function cmdRollback(flags, argvRaw) {
  const journal = journalRead()
  const rolledBack = new Set(journal.filter(e => e.cmd === 'rollback' && e.ok && e.targetOpId).map(e => e.targetOpId))
  let target
  if (flags.op) {
    target = journal.find(e => e.opId === flags.op && e.ok)
    if (target && rolledBack.has(target.opId)) fail(2, `op ${target.opId} was already rolled back`)
  } else {
    target = [...journal].reverse().find(e =>
      e.ok && e.cmd !== 'rollback' && e.cmd !== 'restore-backup' && !rolledBack.has(e.opId))
  }
  if (!target) fail(2, flags.op ? `journal has no successful op ${flags.op}` : 'journal has no op left to roll back')

  await runMutation('rollback', flags, argvRaw, async (ctx) => {
    const { db } = ctx
    ctx.journalExtra.targetOpId = target.opId
    const conflicts = []
    const beforeRows = (target.tasksBefore || []).filter(r => !r.__absent)
    const createdIds = target.createdTasks || []

    for (const row of beforeRows) {
      const cur = db.prepare('SELECT * FROM tasks WHERE id=?').get(row.id)
      if (cur && cur.lamport_ts !== target.lamport) conflicts.push({ id: row.id, reason: `modified after the op (lamport ${cur.lamport_ts} != ${target.lamport})` })
    }
    for (const id of createdIds) {
      const cur = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      if (cur && !cur.deleted_at && cur.lamport_ts !== target.lamport) conflicts.push({ id, reason: `created by the op but modified since (lamport ${cur.lamport_ts})` })
    }
    if (conflicts.length && !flags['force-partial'])
      throw new OpError(6, [`rollback conflicts — these rows changed after op ${target.opId}: ${JSON.stringify(conflicts)}. Re-run with --force-partial to roll back only the untouched rows.`])
    const conflicted = new Set(conflicts.map(c => c.id))

    // 1. Rows that existed before: restore full content (all columns except
    //    lamport/device, which must advance for the revert to propagate via sync).
    for (const row of beforeRows) {
      if (conflicted.has(row.id)) { ctx.warnings.push(`skipped conflicted ${row.id}`); continue }
      ctx.touchTask(row.id)
      const cur = db.prepare('SELECT id FROM tasks WHERE id=?').get(row.id)
      const contentCols = TASK_COLUMNS.filter(c => c !== 'id' && !BOOKKEEPING.has(c))
      if (cur) {
        db.prepare(`UPDATE tasks SET ${contentCols.map(c => `${c}=?`).join(', ')}, lamport_ts=?, device_id=? WHERE id=?`)
          .run(...contentCols.map(c => row[c] ?? null), ctx.lamport, ctx.agentId, row.id)
      } else {
        db.prepare(TASK_INSERT).run(...TASK_COLUMNS.map(c =>
          c === 'lamport_ts' ? ctx.lamport : c === 'device_id' ? ctx.agentId : (row[c] ?? null)))
      }
      ctx.log('tasks', row.id, 'update', rowToTask({ ...row, lamport_ts: ctx.lamport, device_id: ctx.agentId }))
      ctx.results.push({ action: 'rollback-restore', id: row.id })
    }
    // 2. Rows created by the op (incl. recurrence spawns): soft-delete.
    for (const id of createdIds) {
      if (conflicted.has(id)) { ctx.warnings.push(`skipped conflicted created ${id}`); continue }
      const cur = db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
      if (!cur || cur.deleted_at) continue
      ctx.touchTask(id)
      db.prepare('UPDATE tasks SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?')
        .run(ctx.now, ctx.now, ctx.lamport, ctx.agentId, id)
      ctx.log('tasks', id, 'delete', null)
      ctx.results.push({ action: 'rollback-unspawn', id })
    }
    // 3. Notes
    for (const n of (target.notesBefore || [])) {
      if (n.__absent) continue
      ctx.touchNote(n.id)
      const cur = db.prepare('SELECT id FROM notes WHERE id=?').get(n.id)
      const cols = NOTE_COLUMNS.filter(c => c !== 'id' && !BOOKKEEPING.has(c))
      if (cur) db.prepare(`UPDATE notes SET ${cols.map(c => `${c}=?`).join(', ')}, lamport_ts=?, device_id=? WHERE id=?`)
        .run(...cols.map(c => n[c] ?? null), ctx.lamport, ctx.agentId, n.id)
      else db.prepare(`INSERT INTO notes (${NOTE_COLUMNS.join(',')}) VALUES (${NOTE_COLUMNS.map(() => '?').join(',')})`)
        .run(...NOTE_COLUMNS.map(c => c === 'lamport_ts' ? ctx.lamport : c === 'device_id' ? ctx.agentId : (n[c] ?? null)))
      ctx.log('notes', n.id, 'update', { content: n.content, deletedAt: n.deleted_at || null })
    }
    for (const id of (target.createdNotes || [])) {
      const cur = db.prepare('SELECT * FROM notes WHERE id=?').get(id)
      if (!cur || cur.deleted_at) continue
      ctx.touchNote(id)
      db.prepare('UPDATE notes SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?').run(ctx.now, ctx.now, ctx.lamport, ctx.agentId, id)
      ctx.log('notes', id, 'delete', { deletedAt: ctx.now })
    }
    // 4. Planner slots hard-deleted by the op: put back if still absent.
    for (const s of (target.slotsBefore || [])) {
      const cur = db.prepare('SELECT id FROM day_plan_slots WHERE id=?').get(s.id)
      const planAlive = db.prepare('SELECT id FROM day_plans WHERE id=?').get(s.plan_id)
      if (cur || !planAlive) continue
      db.prepare(`INSERT INTO day_plan_slots (id, plan_id, task_id, title, start_time, end_time, slot_type, sort_order, recurrence, created_at, device_id, lamport_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(s.id, s.plan_id, s.task_id, s.title, s.start_time, s.end_time, s.slot_type, s.sort_order, s.recurrence, s.created_at, s.device_id, s.lamport_ts)
      ctx.results.push({ action: 'rollback-slot', id: s.id })
    }
    // 5. Lookups for restored values
    for (const row of beforeRows) {
      if (conflicted.has(row.id) || row.deleted_at) continue
      const t = rowToTask(row)
      if (t.list) upsertLookup(ctx, 'lists', t.list, false)
      for (const tag of t.tags) upsertLookup(ctx, 'tags', tag, false)
      for (const p of t.personas) upsertLookup(ctx, 'personas', p, false)
      if (t.flowId) upsertLookup(ctx, 'flows', t.flowId, false)
    }
  })
}

// ─── Backup commands ────────────────────────────────────────────────────────

function cmdBackup(flags) {
  const db = openDb({ readonly: false })
  preflightSchema(db)
  const file = makeBackup(db, flags.label || 'manual')
  db.close()
  out({ ok: true, backup: file })
}

function cmdBackups() {
  let files = []
  try {
    files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse()
      .map(f => ({ file: join(BACKUP_DIR, f), size: statSync(join(BACKUP_DIR, f)).size }))
  } catch {}
  out({ ok: true, dir: BACKUP_DIR, backups: files })
}

function cmdRestoreBackup(flags, file) {
  if (!file) fail(2, 'usage: restore-backup <backupFile> --yes')
  if (!existsSync(file)) fail(2, `backup not found: ${file}`)
  if (!flags.yes) fail(2, 'restore-backup REPLACES the whole database and discards ALL changes made after the backup (by the user, other devices and the agent). Confirm with the user, then pass --yes.')
  const procs = appProcesses()
  if (procs.length) fail(4, `Task Orchestrator is running — close it before restoring a backup (no --force here by design).`)
  acquireLock('restore-backup')
  try {
    // Safety snapshot of the current state first
    const db = openDb({ readonly: false })
    const safety = makeBackup(db, 'pre-restore-safety')
    db.close()
    copyFileSync(file, DB_PATH)
    for (const suffix of ['-wal', '-shm']) { try { rmSync(DB_PATH + suffix) } catch {} }
    journalAppend({ ok: true, opId: 'restore-' + Date.now(), ts: new Date().toISOString(), cmd: 'restore-backup', argv: [file], safetyBackup: safety })
    out({ ok: true, restored: file, safetyBackup: safety, note: 'Full DB replaced. The app will pick it up on next launch. Sync may re-import newer changes from Drive.' })
  } finally { releaseLock() }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  const f = args.flags
  switch (cmd) {
    case 'status': return cmdStatus()
    case 'list': return cmdList(f)
    case 'get': return cmdGet(f, args._[0])
    case 'verify': return cmdVerify(f)
    case 'journal': {
      const j = journalRead().slice(-(parseInt(f.limit || '20')))
      return out({ ok: true, entries: j.map(e => ({ opId: e.opId, ts: e.ts, cmd: e.cmd, batchId: e.batchId, lamport: e.lamport, summary: e.summary, targetOpId: e.targetOpId })) })
    }
    case 'add': {
      const json = readJsonInput(f)
      const task = json?.task || json || {}
      Object.assign(task, collectFieldFlags(f))
      return runMutation('add', f, process.argv.slice(2), async ctx => { ctx.results.push(await doAdd(ctx, task)) })
    }
    case 'update': {
      const id = args._[0]
      if (!id) fail(2, 'usage: update <taskId> [--json {...changes}] [field flags]')
      const json = readJsonInput(f)
      const changes = json?.changes || json || {}
      Object.assign(changes, collectFieldFlags(f))
      if (!Object.keys(changes).length) fail(2, 'no changes given')
      return runMutation('update', f, process.argv.slice(2), async ctx => { ctx.results.push(await doUpdate(ctx, id, changes, { skipBlocked: !!f['skip-blocked'] })) })
    }
    case 'complete': case 'reopen': case 'delete': case 'restore': {
      const ids = args._
      if (!ids.length) fail(2, `usage: ${cmd} <taskId> [taskId...]`)
      const action = cmd === 'complete' ? { action: 'complete' } : cmd === 'reopen' ? { action: 'reopen' } : { action: cmd }
      const ops = ids.map(id => ({ ...action, id }))
      return runMutation(cmd, f, process.argv.slice(2), async ctx => applyOps(ctx, ops, f))
    }
    case 'batch': {
      const json = readJsonInput(f)
      if (!json) fail(2, 'usage: batch --file ops.json | --json "..." (object {batchId?, ops:[...]} or bare array)')
      const ops = Array.isArray(json) ? json : json.ops
      if (json.batchId && !f['batch-id']) f['batch-id'] = json.batchId
      const contentHash = createHash('sha1').update(JSON.stringify(ops)).digest('hex')
      return runMutation('batch', f, process.argv.slice(2), async ctx => applyOps(ctx, ops, f), { contentHash })
    }
    case 'rollback': return cmdRollback(f, process.argv.slice(2))
    case 'backup': return cmdBackup(f)
    case 'backups': return cmdBackups()
    case 'restore-backup': return cmdRestoreBackup(f, args._[0])
    default:
      fail(2, `unknown command "${cmd || ''}". Commands: status, list, get, verify, journal, add, update, complete, reopen, delete, restore, batch, rollback, backup, backups, restore-backup. See SKILL.md.`)
  }
}

main().catch(e => {
  try { releaseLock() } catch {}
  fail(7, `internal error: ${e.stack || e.message}`)
})
