import { useState, useEffect, useCallback, useRef } from 'react'
import Database from '@tauri-apps/plugin-sql'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { copyFile, remove, exists, readDir } from '@tauri-apps/plugin-fs'
import { revealItemInDir, openUrl } from '@tauri-apps/plugin-opener'

const DB_PATH_KEY = 'to_db_path'

// ─── Schema v1 (idempotent CREATE TABLE IF NOT EXISTS) ────────────────────────

const MIGRATIONS_V1 = [
  `CREATE TABLE IF NOT EXISTS lists (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS tags (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS flows (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS personas (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id         TEXT PRIMARY KEY,
     title      TEXT NOT NULL,
     status     TEXT NOT NULL DEFAULT 'inbox',
     priority   INTEGER NOT NULL DEFAULT 4,
     list_name  TEXT,
     due        TEXT,
     recurrence TEXT,
     flow_id    TEXT,
     depends_on TEXT,
     tags       TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS notes (
     id             TEXT PRIMARY KEY,
     task_series_id TEXT NOT NULL,
     title          TEXT NOT NULL DEFAULT '',
     content        TEXT NOT NULL DEFAULT '',
     created_at     INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_series ON notes(task_series_id)`,
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT
   )`,
]

// ─── Schema v2 (ALTER TABLE — run once, guarded by version) ──────────────────

const MIGRATIONS_V2 = [
  `ALTER TABLE tasks ADD COLUMN url          TEXT`,
  `ALTER TABLE tasks ADD COLUMN date_start   TEXT`,
  `ALTER TABLE tasks ADD COLUMN estimate     TEXT`,
  `ALTER TABLE tasks ADD COLUMN postponed    INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN rtm_series_id TEXT`,
]

// ─── Schema v3 ────────────────────────────────────────────────────────────────

const MIGRATIONS_V3 = [
  `ALTER TABLE tasks ADD COLUMN personas TEXT NOT NULL DEFAULT '[]'`,
]

// ─── Schema v4 — flow metadata ────────────────────────────────────────────────

const MIGRATIONS_V4 = [
  `CREATE TABLE IF NOT EXISTS flow_meta (
     name        TEXT PRIMARY KEY,
     description TEXT NOT NULL DEFAULT '',
     color       TEXT NOT NULL DEFAULT '',
     deadline    TEXT
   )`,
]

// ─── Schema v5 — completed_at timestamp ──────────────────────────────────────

const MIGRATIONS_V5 = [
  `ALTER TABLE tasks ADD COLUMN completed_at TEXT`,
]

// ─── Schema v6 — sync preparation (updated_at, deleted_at, device_id, sync_log)

const MIGRATIONS_V6 = [
  `ALTER TABLE tasks ADD COLUMN updated_at TEXT`,
  `ALTER TABLE tasks ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE tasks ADD COLUMN device_id TEXT`,
  `CREATE TABLE IF NOT EXISTS sync_log (
     id         TEXT PRIMARY KEY,
     entity     TEXT NOT NULL,
     entity_id  TEXT NOT NULL,
     action     TEXT NOT NULL,
     timestamp  TEXT NOT NULL,
     device_id  TEXT,
     data       TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity, entity_id)`,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES   = ['inbox', 'active', 'done', 'cancelled']
const VALID_PRIORITIES = [1, 2, 3, 4]

// Canonical column list for INSERT INTO tasks — must match schema (v1–v6).
// Using explicit columns prevents breakage when new columns are added via migrations.
const TASK_COLUMNS = [
  'id', 'title', 'status', 'priority', 'list_name', 'due', 'recurrence',
  'flow_id', 'depends_on', 'tags', 'created_at',
  'url', 'date_start', 'estimate', 'postponed', 'rtm_series_id',
  'personas', 'completed_at',
  'updated_at', 'deleted_at', 'device_id',
]
const TASK_INSERT     = `INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`
const TASK_INSERT_IGN = `INSERT OR IGNORE INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`

function rowToTask(row, notesMap = {}) {
  // Sanitize status/priority — guard against corrupted data saved by old UI bugs.
  const status   = VALID_STATUSES.includes(row.status) ? row.status : 'inbox'
  const priority = VALID_PRIORITIES.includes(Number(row.priority)) ? Number(row.priority) : 4
  return {
    id:           row.id,
    title:        row.title || '(untitled)',
    status,
    priority,
    list:         row.list_name,
    due:          row.due,
    recurrence:   row.recurrence,
    flowId:       row.flow_id,
    dependsOn:    row.depends_on,
    tags:         JSON.parse(row.tags     || '[]'),
    personas:     JSON.parse(row.personas || '[]'),
    createdAt:    row.created_at,
    subtasks:     [],
    // extended fields
    url:          row.url          || null,
    dateStart:    row.date_start   || null,
    estimate:     row.estimate     || null,
    postponed:    row.postponed    || 0,
    rtmSeriesId:  row.rtm_series_id || null,
    completedAt:  row.completed_at || null,
    updatedAt:    row.updated_at   || null,
    deletedAt:    row.deleted_at   || null,
    deviceId:     row.device_id    || null,
    notes:        notesMap[row.rtm_series_id || row.id] || [],
  }
}

// Validates that a value is either null/undefined/empty or a valid ISO date (YYYY-MM-DD).
// Returns the value if valid, null otherwise. This is a safety net — all date values
// MUST be validated before reaching this layer, but this prevents corrupt data in the DB.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function safeIsoDate(v) {
  if (!v) return null
  if (ISO_DATE_RE.test(v)) return v
  console.warn('[TaskStore] Rejected non-ISO date value:', v)
  return null
}

// Returns array of values matching INSERT column order (21 columns)
function taskToRow(task) {
  const now = new Date().toISOString()
  return [
    task.id,
    task.title,
    task.status      || 'inbox',
    task.priority    || 4,
    task.list        || null,
    safeIsoDate(task.due),
    task.recurrence  || null,
    task.flowId      || null,
    task.dependsOn   || null,
    JSON.stringify(task.tags     || []),
    task.createdAt   || now,
    task.url         || null,
    safeIsoDate(task.dateStart),
    task.estimate    || null,
    task.postponed   || 0,
    task.rtmSeriesId || null,
    JSON.stringify(task.personas || []),
    task.completedAt || null,
    task.updatedAt   || now,
    task.deletedAt   || null,
    task.deviceId    || null,
  ]
}

// Touch updated_at for a set of task IDs
async function touchUpdatedAt(db, ids) {
  const now = new Date().toISOString()
  const idArr = ids instanceof Set ? [...ids] : (Array.isArray(ids) ? ids : [ids])
  if (idArr.length === 1) {
    await db.execute('UPDATE tasks SET updated_at=? WHERE id=?', [now, idArr[0]])
  } else if (idArr.length > 1) {
    const ph = idArr.map(() => '?').join(',')
    await db.execute(`UPDATE tasks SET updated_at=? WHERE id IN (${ph})`, [now, ...idArr])
  }
}

function shiftDue(due) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due
  const d = new Date(due + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Returns next due date string for a recurring task, or null for unknown recurrence.
// Handles both simple strings ("daily","weekly","monthly") and iCal RRULE
// ("FREQ=DAILY;INTERVAL=1;WKST=SU" etc.) as stored from RTM import.
function nextDue(due, recurrence) {
  if (!recurrence) return null
  const today = new Date().toISOString().slice(0, 10)
  const base  = (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) ? due : today
  const d = new Date(base + 'T12:00:00')

  let freq     = recurrence.toLowerCase()  // default: treat whole string as freq
  let interval = 1

  if (recurrence.includes('FREQ=')) {
    const fm = recurrence.match(/FREQ=([A-Z]+)/i)
    const im = recurrence.match(/INTERVAL=(\d+)/i)
    freq     = fm ? fm[1].toLowerCase() : null
    interval = im ? parseInt(im[1], 10) : 1
  }

  if      (freq === 'daily')   d.setDate(d.getDate() + interval)
  else if (freq === 'weekly')  d.setDate(d.getDate() + 7 * interval)
  else if (freq === 'monthly') d.setMonth(d.getMonth() + interval)
  else if (freq === 'yearly')  d.setFullYear(d.getFullYear() + interval)
  else return null

  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}

// Activate tasks that depend on the just-completed task and have all deps satisfied.
// Returns array of activated task titles (for toast).
async function activateDependents(db, completedTaskId) {
  // Find tasks that depend on the completed task and are still in 'inbox'
  const dependents = await db.select(
    "SELECT id, title, depends_on FROM tasks WHERE depends_on = ? AND status = 'inbox'",
    [completedTaskId]
  )
  const activated = []
  for (const dep of dependents) {
    // Check if all dependencies are done (currently single dependency, but future-proof)
    const [blocker] = await db.select(
      "SELECT id FROM tasks WHERE id = ? AND status != 'done'",
      [dep.depends_on]
    )
    if (!blocker) {
      await db.execute("UPDATE tasks SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), dep.id])
      activated.push(dep.title)
    }
  }
  return activated
}

// Reads task from DB and inserts next occurrence if task has recurrence.
async function spawnNextOccurrence(db, taskId) {
  const [row] = await db.select('SELECT * FROM tasks WHERE id=?', [taskId])
  if (!row || !row.recurrence) return
  const newDue = nextDue(row.due, row.recurrence)
  if (!newDue) return
  const next = {
    id:          ulid(),
    title:       row.title,
    status:      'active',
    priority:    row.priority || 4,
    list:        row.list_name || null,
    due:         newDue,
    recurrence:  row.recurrence,
    flowId:      row.flow_id  || null,
    dependsOn:   null,
    tags:        JSON.parse(row.tags     || '[]'),
    personas:    JSON.parse(row.personas || '[]'),
    url:         row.url      || null,
    dateStart:   null,
    estimate:    row.estimate || null,
    postponed:   0,
    rtmSeriesId: row.rtm_series_id || null,
    createdAt:   new Date().toISOString(),
  }
  await db.execute(TASK_INSERT, taskToRow(next))
}

// Convert a timestamp (ms) to a local YYYY-MM-DD string.
// Using toISOString() would give UTC date and shift the day back for UTC+ timezones.
function localDateStr(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

import { ulid } from './ulid.js'

// Transaction wrapper — currently disabled (Tauri SQL plugin has issues with
// explicit BEGIN/COMMIT causing "database is locked" errors). All operations
// run in auto-commit mode. Re-enable when plugin transaction support is verified.
async function withTransaction(db, fn) {
  return fn()
}

async function fetchAll(db) {
  const [taskRows, noteRows] = await Promise.all([
    db.select('SELECT * FROM tasks ORDER BY priority, created_at'),
    db.select('SELECT * FROM notes ORDER BY created_at'),
  ])
  // Build series_id → notes[]
  const notesMap = {}
  for (const n of noteRows) {
    if (!notesMap[n.task_series_id]) notesMap[n.task_series_id] = []
    notesMap[n.task_series_id].push({
      id:        n.id,
      title:     n.title,
      content:   n.content,
      createdAt: new Date(n.created_at).toISOString(),
    })
  }
  return taskRows.map(row => rowToTask(row, notesMap))
}

// ─── DB backup before migration ──────────────────────────────────────────────

const LATEST_SCHEMA_VERSION = 6
const MAX_BACKUPS = 2

async function resolveDbPath() {
  const customPath = localStorage.getItem(DB_PATH_KEY)
  if (customPath) return customPath
  try {
    const dir = await appDataDir()
    return await join(dir, 'tasks.db')
  } catch { return null }
}

async function backupBeforeMigration(dbPath, fromVersion) {
  if (!dbPath) return
  try {
    const fileExists = await exists(dbPath)
    if (!fileExists) return

    const date = new Date().toISOString().slice(0, 10)
    const dir = dbPath.replace(/[/\\][^/\\]*$/, '')
    const backupName = `tasks.backup-v${fromVersion}-${date}.db`
    const backupPath = await join(dir, backupName)

    await copyFile(dbPath, backupPath)

    // Rotate: keep only MAX_BACKUPS most recent backup files
    try {
      const entries = await readDir(dir)
      const backups = entries
        .filter(e => e.name && e.name.startsWith('tasks.backup-v') && e.name.endsWith('.db'))
        .map(e => e.name)
        .sort()
        .reverse()
      for (const old of backups.slice(MAX_BACKUPS)) {
        try { await remove(await join(dir, old)) } catch (_) {}
      }
    } catch (_) {}
  } catch (err) {
    console.error('Backup before migration failed:', err)
  }
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db = null

async function openDb() {
  if (_db) return _db
  const customPath = localStorage.getItem(DB_PATH_KEY)
  const connStr = customPath
    ? `sqlite:${customPath.replace(/\\/g, '/')}`
    : 'sqlite:tasks.db'
  _db = await Database.load(connStr)
  await _db.execute('PRAGMA foreign_keys = ON')
  await _db.execute('PRAGMA journal_mode = WAL')

  // v1 migrations — all idempotent
  for (const sql of MIGRATIONS_V1) await _db.execute(sql)

  // versioned migrations — run once, guarded by meta table
  const [vRow] = await _db.select("SELECT value FROM meta WHERE key='schema_version'")
  const version = parseInt(vRow?.value || '1')

  // Backup before migration if schema is outdated
  if (version < LATEST_SCHEMA_VERSION) {
    await backupBeforeMigration(await resolveDbPath(), version)
  }

  if (version < 2) {
    for (const sql of MIGRATIONS_V2) {
      try { await _db.execute(sql) } catch (_) { /* column already exists */ }
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','2')")
  }
  if (version < 3) {
    for (const sql of MIGRATIONS_V3) {
      try { await _db.execute(sql) } catch (_) { /* column already exists */ }
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','3')")
  }
  if (version < 4) {
    for (const sql of MIGRATIONS_V4) {
      try { await _db.execute(sql) } catch (_) { /* table already exists */ }
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','4')")
  }
  if (version < 5) {
    for (const sql of MIGRATIONS_V5) {
      try { await _db.execute(sql) } catch (_) { /* column already exists */ }
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','5')")
  }
  if (version < 6) {
    for (const sql of MIGRATIONS_V6) {
      try { await _db.execute(sql) } catch (_) { /* column/table already exists */ }
    }
    // Backfill updated_at for existing tasks
    try { await _db.execute("UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL") } catch (_) {}
    // Generate device_id if not yet stored
    const [devRow] = await _db.select("SELECT value FROM meta WHERE key='device_id'")
    if (!devRow) {
      const { ulid: genId } = await import('./ulid.js')
      await _db.execute("INSERT OR REPLACE INTO meta VALUES ('device_id', ?)", [genId()])
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','6')")
  }

  return _db
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTauriTaskStore() {
  const [tasks,        setTasks]        = useState([])
  const [lists,        setLists]        = useState([])
  const [tags,         setTags]         = useState([])
  const [flows,        setFlows]        = useState([])
  const [flowMeta,     setFlowMeta]     = useState({})   // { name: { description, color, deadline } }
  const [personas,     setPersonas]     = useState([])
  const [history,      setHistory]      = useState([])
  const [metaSettings, setMetaSettings] = useState(null)
  const [dbPath,       setDbPath]       = useState('')
  const [dbKey,        setDbKey]        = useState(0)
  const dbRef = useRef(null)

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    openDb().then(async db => {
      dbRef.current = db

      // Resolve and expose the current DB path
      const customPath = localStorage.getItem(DB_PATH_KEY)
      if (customPath) {
        setDbPath(customPath)
      } else {
        try {
          const dir = await appDataDir()
          setDbPath(await join(dir, 'tasks.db'))
        } catch { setDbPath('tasks.db') }
      }

      const [taskRows, listRows, tagRows, flowRows, personaRows, flowMetaRows] = await Promise.all([
        fetchAll(db),
        db.select('SELECT name FROM lists    ORDER BY name'),
        db.select('SELECT name FROM tags     ORDER BY name'),
        db.select('SELECT name FROM flows    ORDER BY name'),
        db.select('SELECT name FROM personas ORDER BY name'),
        db.select('SELECT * FROM flow_meta'),
      ])
      setTasks(taskRows)
      setLists(listRows.map(r => r.name))
      setTags(tagRows.map(r => r.name))
      setFlows(flowRows.map(r => r.name))
      setPersonas(personaRows.map(r => r.name))
      const fm = {}
      for (const r of flowMetaRows) fm[r.name] = { description: r.description || '', color: r.color || '', deadline: r.deadline || null }
      setFlowMeta(fm)

      // Load persisted app settings from meta table
      const metaRows = await db.select(
        "SELECT key, value FROM meta WHERE key IN ('to_locale', 'to_theme', 'to_settings', 'to_guide_completed')"
      )
      const meta = {}
      for (const row of metaRows) meta[row.key] = row.value
      setMetaSettings(meta)
    }).catch(console.error)
  }, [dbKey])

  // WAL checkpoint happens in _closeDb() which is called on DB switch/move.
  // beforeunload is unreliable for async operations in Tauri WebView.

  // ── Mutation wrapper ───────────────────────────────────────────────────────
  const mutate = useCallback(async (currentTasks, fn) => {
    const db = dbRef.current
    if (!db) return
    setHistory(h => [...h.slice(-20), currentTasks])
    await fn(db)
    setTasks(await fetchAll(db))
  }, [])

  const refreshRef = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    const [listRows, tagRows, flowRows, personaRows, flowMetaRows] = await Promise.all([
      db.select('SELECT name FROM lists    ORDER BY name'),
      db.select('SELECT name FROM tags     ORDER BY name'),
      db.select('SELECT name FROM flows    ORDER BY name'),
      db.select('SELECT name FROM personas ORDER BY name'),
      db.select('SELECT * FROM flow_meta'),
    ])
    setLists(listRows.map(r => r.name))
    setTags(tagRows.map(r => r.name))
    setFlows(flowRows.map(r => r.name))
    setPersonas(personaRows.map(r => r.name))
    const fm = {}
    for (const r of flowMetaRows) fm[r.name] = { description: r.description || '', color: r.color || '', deadline: r.deadline || null }
    setFlowMeta(fm)
  }, [])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addTask = useCallback((data, cur) => mutate(cur, async db => {
    const task = {
      id: ulid(), title: data.title || '', status: data.status || 'inbox',
      priority: data.priority || 4, list: data.list || null,
      due: data.due || null, recurrence: data.recurrence || null,
      flowId: data.flowId || null, dependsOn: data.dependsOn || null,
      tags: data.tags || [], personas: data.personas || [],
      url: data.url || null, dateStart: data.dateStart || null,
      estimate: data.estimate || null, postponed: 0, rtmSeriesId: null,
      createdAt: new Date().toISOString(),
    }
    await withTransaction(db, async () => {
      await db.execute(TASK_INSERT, taskToRow(task))
      if (task.list)   await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
      for (const t of task.tags)     await db.execute('INSERT OR IGNORE INTO tags     VALUES (?)', [t])
      for (const p of task.personas) await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
      if (task.flowId) await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [task.flowId])
    })
    refreshRef()
  }), [mutate, refreshRef])

  const bulkStatus = useCallback((ids, status, cur) => {
    let activatedNames = []
    let skippedBlocked = 0
    const promise = mutate(cur, async db => {
      const isBlocked = async (id) => {
        const [row] = await db.select('SELECT depends_on FROM tasks WHERE id=?', [id])
        if (!row?.depends_on) return false
        const [dep] = await db.select("SELECT id FROM tasks WHERE id=? AND status != 'done'", [row.depends_on])
        return !!dep
      }

      await withTransaction(db, async () => {
        if (status === 'active' || status === 'done') {
          for (const id of [...ids]) {
            if (await isBlocked(id)) { skippedBlocked++; continue }
            await db.execute('UPDATE tasks SET status=? WHERE id=?', [status, id])
            if (status === 'done') {
              await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [new Date().toISOString(), id])
              await spawnNextOccurrence(db, id)
              const names = await activateDependents(db, id)
              activatedNames.push(...names)
            } else {
              await db.execute('UPDATE tasks SET completed_at=NULL WHERE id=?', [id])
            }
          }
        } else {
          const ph = [...ids].map(() => '?').join(',')
          await db.execute(`UPDATE tasks SET status=? WHERE id IN (${ph})`, [status, ...[...ids]])
          await db.execute(`UPDATE tasks SET completed_at=NULL WHERE id IN (${ph})`, [...ids])
        }
        await touchUpdatedAt(db, ids)
      })
    })
    return promise.then(() => ({ activated: activatedNames, skippedBlocked }))
  }, [mutate])

  const bulkCycle = useCallback((ids, cur) => {
    let activatedNames = []
    const promise = mutate(cur, async db => {
      const FULL_CYCLE    = ['inbox', 'active', 'done', 'cancelled']
      const BLOCKED_CYCLE = ['inbox', 'cancelled']
      await withTransaction(db, async () => {
        for (const id of ids) {
          const [row] = await db.select('SELECT status, depends_on FROM tasks WHERE id=?', [id])
          if (!row) continue
          let blocked = false
          if (row.depends_on) {
            const [dep] = await db.select("SELECT id FROM tasks WHERE id=? AND status != 'done'", [row.depends_on])
            if (dep) blocked = true
          }
          const cycle = blocked ? BLOCKED_CYCLE : FULL_CYCLE
          const curIdx = cycle.indexOf(row.status)
          const next = cycle[(curIdx + 1) % cycle.length]
          await db.execute('UPDATE tasks SET status=? WHERE id=?', [next, id])
          await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [next === 'done' ? new Date().toISOString() : null, id])
          if (next === 'done') {
            await spawnNextOccurrence(db, id)
            const names = await activateDependents(db, id)
            activatedNames.push(...names)
          }
        }
        await touchUpdatedAt(db, ids)
      })
    })
    return promise.then(() => ({ activated: activatedNames }))
  }, [mutate])

  const bulkDelete = useCallback(async (ids, cur) => {
    const idArr = [...ids]
    const ph    = idArr.map(() => '?').join(',')
    await mutate(cur, async db => {
      await withTransaction(db, async () => {
        const rows = await db.select(`SELECT id, rtm_series_id FROM tasks WHERE id IN (${ph})`, idArr)
        for (const row of rows) {
          await db.execute('DELETE FROM notes WHERE task_series_id=?', [row.rtm_series_id || row.id])
        }
        await db.execute(`DELETE FROM tasks WHERE id IN (${ph})`, idArr)
        await db.execute(`DELETE FROM lists     WHERE name NOT IN (SELECT DISTINCT list_name FROM tasks WHERE list_name IS NOT NULL)`)
        await db.execute(`DELETE FROM flows WHERE name NOT IN (SELECT DISTINCT flow_id FROM tasks WHERE flow_id IS NOT NULL) AND name NOT IN (SELECT name FROM flow_meta)`)
        await db.execute(`DELETE FROM tags      WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.tags))`)
        await db.execute(`DELETE FROM personas  WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.personas))`)
      })
      await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    })
    await refreshRef()
  }, [mutate, refreshRef])

  const bulkPriority = useCallback((ids, priority, cur) => mutate(cur, async db => {
    const ph = [...ids].map(() => '?').join(',')
    await db.execute(`UPDATE tasks SET priority=? WHERE id IN (${ph})`, [priority, ...[...ids]])
    await touchUpdatedAt(db, ids)
  }), [mutate])

  const bulkDueShift = useCallback((ids, cur) => mutate(cur, async db => {
    for (const id of ids) {
      const [row] = await db.select('SELECT due FROM tasks WHERE id=?', [id])
      if (!row) continue
      await db.execute('UPDATE tasks SET due=?, postponed=COALESCE(postponed,0)+1 WHERE id=?', [shiftDue(row.due), id])
    }
    await touchUpdatedAt(db, ids)
  }), [mutate])

  // Snooze: shift due by `days` days and/or `months` months; increment postponed by 1.
  // If the task has no due date, base is today.
  const bulkSnooze = useCallback((ids, days, months, cur) => mutate(cur, async db => {
    const today = new Date().toISOString().slice(0, 10)
    await withTransaction(db, async () => {
      for (const id of ids) {
        const [row] = await db.select('SELECT due FROM tasks WHERE id=?', [id])
        if (!row) continue
        const base = (row.due && /^\d{4}-\d{2}-\d{2}$/.test(row.due))
          ? new Date(row.due + 'T12:00:00')
          : new Date(today + 'T12:00:00')
        if (months) base.setMonth(base.getMonth() + months)
        if (days)   base.setDate(base.getDate() + days)
        const newDue = base.toISOString().slice(0, 10)
        await db.execute('UPDATE tasks SET due=?, postponed=COALESCE(postponed,0)+1 WHERE id=?', [newDue, id])
      }
      await touchUpdatedAt(db, ids)
    })
  }), [mutate])

  const bulkAssignToday = useCallback((ids, cur) => mutate(cur, async db => {
    const today = new Date().toISOString().slice(0, 10)
    await withTransaction(db, async () => {
      for (const id of ids) {
        await db.execute("UPDATE tasks SET status='active', due=? WHERE id=?", [today, id])
      }
      await touchUpdatedAt(db, ids)
    })
  }), [mutate])

  // ── Update single task ─────────────────────────────────────────────────────
  const updateTask = useCallback((id, changes, cur) => {
    let activatedNames = []
    const promise = mutate(cur, async db => {
    const COL = {
      title: 'title', status: 'status', priority: 'priority',
      list: 'list_name', due: 'due', recurrence: 'recurrence',
      flowId: 'flow_id', dependsOn: 'depends_on',
      url: 'url', dateStart: 'date_start', estimate: 'estimate', postponed: 'postponed',
      tags: 'tags', personas: 'personas',
    }
    const setClauses = []
    const values = []
    const JSON_COLS = new Set(['tags', 'personas'])
    const DATE_COLS = new Set(['due', 'dateStart'])
    for (const [key, val] of Object.entries(changes)) {
      const col = COL[key]
      if (!col) continue
      setClauses.push(`${col} = ?`)
      const v = DATE_COLS.has(key) ? safeIsoDate(val) : (JSON_COLS.has(key) ? JSON.stringify(val ?? []) : (val ?? null))
      values.push(v)
    }
    // Always update updated_at on any change
    setClauses.push('updated_at = ?')
    values.push(new Date().toISOString())
    if (setClauses.length) {
      values.push(id)
      await db.execute(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`, values)
    }
    // Auto-set completed_at when status changes
    if (changes.status === 'done') {
      try { await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [new Date().toISOString(), id]) } catch (_) {}
    } else if (changes.status && changes.status !== 'done') {
      try { await db.execute('UPDATE tasks SET completed_at=NULL WHERE id=?', [id]) } catch (_) {}
    }
    if (changes.list)     await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [changes.list])
    if (changes.tags)     for (const tag of changes.tags)         await db.execute('INSERT OR IGNORE INTO tags     VALUES (?)', [tag])
    if (changes.personas) for (const p   of changes.personas)     await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
    if (changes.flowId)   await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [changes.flowId])
    if (changes.status === 'done') {
      await spawnNextOccurrence(db, id)
      const names = await activateDependents(db, id)
      activatedNames.push(...names)
    }
    // Sync notes: use rtm_series_id if present, otherwise task id
    if (changes.notes !== undefined) {
      const [taskRow] = await db.select('SELECT rtm_series_id FROM tasks WHERE id=?', [id])
      const seriesKey = taskRow?.rtm_series_id || id
      await db.execute('DELETE FROM notes WHERE task_series_id=?', [seriesKey])
      for (const note of changes.notes) {
        const ts = note.createdAt ? new Date(note.createdAt).getTime() : Date.now()
        await db.execute(
          'INSERT INTO notes VALUES (?,?,?,?,?)',
          [note.id, seriesKey, note.title || '', note.content || '', ts]
        )
      }
    }
    refreshRef()
  })
    return promise.then(() => activatedNames)
  }, [mutate, refreshRef])

  // ── RTM Import ─────────────────────────────────────────────────────────────
  const importRtm = useCallback(async (jsonData, options = {}) => {
    const db = dbRef.current
    if (!db) return { imported: 0, skipped: 0 }

    const { includeCompleted = false, onProgress } = options
    const PRIO_MAP = { P1: 1, P2: 2, P3: 3, PN: 4 }

    // Build list id → name lookup
    const listMap = {}
    for (const l of (jsonData.lists || [])) listMap[l.id] = l.name

    // Filter tasks
    const rtmTasks = jsonData.tasks || []
    const tasksToImport = rtmTasks.filter(t =>
      includeCompleted ? true : !(t.date_completed || t.date_trashed)
    )
    const total = tasksToImport.length
    if (onProgress) onProgress(0, total)

    // Insert tasks
    let inserted = 0
    await withTransaction(db, async () => {
      for (const t of tasksToImport) {
        const status = t.date_completed ? 'done'
                     : t.date_trashed   ? 'cancelled'
                     : 'active'
        const task = {
          id:           ulid(),
          title:        t.name || '',
          status,
          priority:     PRIO_MAP[t.priority] || 4,
          list:         listMap[t.list_id]   || null,
          due:          t.date_due   ? localDateStr(t.date_due)   : null,
          dateStart:    t.date_start ? localDateStr(t.date_start) : null,
          recurrence:   t.repeat     || null,
          flowId:       null,
          dependsOn:    null,
          tags:         Array.isArray(t.tags) ? t.tags : [],
          createdAt:    new Date(t.date_created).toISOString(),
          url:          t.url      || null,
          estimate:     t.estimate != null ? String(t.estimate) : null,
          postponed:    t.postponed || 0,
          rtmSeriesId:  t.series_id || null,
        }
        await db.execute(TASK_INSERT_IGN, taskToRow(task))
        if (task.list) await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
        for (const tag of task.tags) await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [tag])
        inserted++
        if (onProgress) onProgress(inserted, total)
      }

      for (const n of (jsonData.notes || [])) {
        await db.execute(
          'INSERT OR IGNORE INTO notes VALUES (?,?,?,?,?)',
          [n.id, n.series_id, n.title || '', n.content || '', n.date_created]
        )
      }
    })

    // Refresh state
    setTasks(await fetchAll(db))
    await refreshRef()

    return { imported: tasksToImport.length, skipped: rtmTasks.length - tasksToImport.length }
  }, [refreshRef])

  // ── Load demo data ─────────────────────────────────────────────────────────
  const loadDemoData = useCallback(async (data) => {
    const db = dbRef.current
    if (!db || !data) return
    const { tasks: demoTasks, lists: demoLists, tags: demoTags, flows: demoFlows, personas: demoPersonas } = data

    await withTransaction(db, async () => {
      for (const n of demoLists)    await db.execute('INSERT OR IGNORE INTO lists    VALUES (?)', [n])
      for (const n of demoTags)     await db.execute('INSERT OR IGNORE INTO tags     VALUES (?)', [n])
      for (const n of demoFlows)    await db.execute('INSERT OR IGNORE INTO flows    VALUES (?)', [n])
      for (const n of demoPersonas) await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [n])

      for (const task of demoTasks) {
        await db.execute(TASK_INSERT_IGN, taskToRow(task))
        if (task.rtmSeriesId && task.notes?.length) {
          for (const note of task.notes) {
            await db.execute(
              'INSERT OR IGNORE INTO notes VALUES (?,?,?,?,?)',
              [note.id, task.rtmSeriesId, note.title || '', note.content || '', new Date(note.createdAt).getTime()]
            )
          }
        }
      }
    })

    setTasks(await fetchAll(db))
    await refreshRef()
  }, [refreshRef])

  // ── Flow meta CRUD ─────────────────────────────────────────────────────────
  const updateFlow = useCallback(async (name, changes) => {
    const db = dbRef.current
    if (!db) return
    // Ensure flow exists in flows table
    await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [name])
    // Upsert flow_meta
    const existing = await db.select('SELECT * FROM flow_meta WHERE name=?', [name])
    if (existing.length === 0) {
      await db.execute(
        'INSERT INTO flow_meta (name, description, color, deadline) VALUES (?,?,?,?)',
        [name, changes.description || '', changes.color || '', changes.deadline || null]
      )
    } else {
      const sets = []
      const vals = []
      if (changes.description !== undefined) { sets.push('description=?'); vals.push(changes.description || '') }
      if (changes.color !== undefined)       { sets.push('color=?');       vals.push(changes.color || '') }
      if (changes.deadline !== undefined)    { sets.push('deadline=?');    vals.push(changes.deadline || null) }
      if (sets.length) {
        vals.push(name)
        await db.execute(`UPDATE flow_meta SET ${sets.join(', ')} WHERE name=?`, vals)
      }
    }
    await refreshRef()
  }, [refreshRef])

  const deleteFlow = useCallback(async (name) => {
    const db = dbRef.current
    if (!db) return
    await db.execute('DELETE FROM flow_meta WHERE name=?', [name])
    await db.execute('DELETE FROM flows WHERE name=?', [name])
    // Clear flowId on tasks that reference this flow
    await db.execute('UPDATE tasks SET flow_id=NULL WHERE flow_id=?', [name])
    setTasks(await fetchAll(db))
    await refreshRef()
  }, [refreshRef])

  // ── Meta settings persistence ──────────────────────────────────────────────
  const saveMeta = useCallback(async (key, value) => {
    const db = dbRef.current
    if (!db) return
    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [key, value])
  }, [])

  // ── Clear All ──────────────────────────────────────────────────────────────
  const clearAll = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await withTransaction(db, async () => {
      await db.execute('DELETE FROM tasks')
      await db.execute('DELETE FROM notes')
      await db.execute('DELETE FROM tags')
      await db.execute('DELETE FROM lists')
      await db.execute('DELETE FROM flows')
      await db.execute('DELETE FROM flow_meta')
      await db.execute('DELETE FROM personas')
    })
    try { await db.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
    setTasks([])
    setTags([])
    setLists([])
    setFlows([])
    setFlowMeta({})
    setPersonas([])
    setHistory([])
  }, [refreshRef])

  // ── DB maintenance ─────────────────────────────────────────────────────────

  const _closeDb = useCallback(async () => {
    if (dbRef.current) {
      try { await dbRef.current.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
      try { await dbRef.current.close() } catch {}
      _db = null
      dbRef.current = null
    }
  }, [])

  const _reinit = useCallback((newPath) => {
    if (newPath !== undefined) {
      if (newPath) localStorage.setItem(DB_PATH_KEY, newPath)
      else localStorage.removeItem(DB_PATH_KEY)
    }
    setTasks([]); setLists([]); setTags([]); setFlows([]); setFlowMeta({}); setPersonas([]); setHistory([])
    setDbKey(k => k + 1)
  }, [])

  const revealDb = useCallback(async () => {
    if (!dbPath) return
    try { await revealItemInDir(dbPath) } catch (e) { console.error(e) }
  }, [dbPath])

  const openNewDb = useCallback(async () => {
    const selected = await openFileDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      multiple: false,
    })
    if (!selected) return false
    await _closeDb()
    _reinit(typeof selected === 'string' ? selected : selected[0])
    return true
  }, [_closeDb, _reinit])

  const moveCurrentDb = useCallback(async () => {
    const dir = await openFileDialog({ directory: true, multiple: false })
    if (!dir) return
    const targetDir = typeof dir === 'string' ? dir : dir[0]
    const currentPath = localStorage.getItem(DB_PATH_KEY)
      || await join(await appDataDir(), 'tasks.db').catch(() => 'tasks.db')
    const targetPath = await join(targetDir, 'tasks.db')

    await _closeDb()  // flush WAL into main file before copying

    try {
      await copyFile(currentPath, targetPath)
      // Remove old files after successful copy
      try { await remove(currentPath) } catch {}
      try { if (await exists(currentPath + '-wal')) await remove(currentPath + '-wal') } catch {}
      try { if (await exists(currentPath + '-shm')) await remove(currentPath + '-shm') } catch {}
      _reinit(targetPath)
    } catch (e) {
      console.error('Failed to move DB:', e)
      _reinit()  // reopen at current path
    }
  }, [_closeDb, _reinit])

  // ── Undo ───────────────────────────────────────────────────────────────────
  const undo = useCallback((onDone) => {
    setHistory(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      ;(async () => {
        const db = dbRef.current
        if (!db) return
        await db.execute('DELETE FROM tasks')
        for (const task of prev) {
          await db.execute(
            TASK_INSERT,
            taskToRow(task)
          )
        }
        setTasks(prev)
        if (onDone) onDone()
      })()
      return h.slice(0, -1)
    })
  }, [])

  // ── Backup management ────────────────────────────────────────────────────
  const createBackup = useCallback(async () => {
    if (!dbPath) return false
    try {
      if (dbRef.current) await dbRef.current.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      const [vRow] = await dbRef.current.select("SELECT value FROM meta WHERE key='schema_version'")
      const version = parseInt(vRow?.value || '1')
      await backupBeforeMigration(dbPath, version)
      return true
    } catch (e) { console.error('Manual backup failed:', e); return false }
  }, [dbPath])

  const listBackups = useCallback(async () => {
    if (!dbPath) return []
    try {
      const dir = dbPath.replace(/[/\\][^/\\]*$/, '')
      const entries = await readDir(dir)
      return entries
        .filter(e => e.name && e.name.startsWith('tasks.backup-v') && e.name.endsWith('.db'))
        .map(e => {
          // Parse: tasks.backup-v{N}-{YYYY-MM-DD}.db
          const m = e.name.match(/^tasks\.backup-v(\d+)-(\d{4}-\d{2}-\d{2})\.db$/)
          return {
            name: e.name,
            schemaVersion: m ? parseInt(m[1]) : null,
            date: m ? m[2] : null,
            path: null, // will be resolved below
          }
        })
        .filter(b => b.schemaVersion !== null)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(b => ({ ...b, path: dir + (dir.includes('/') ? '/' : '\\') + b.name }))
    } catch { return [] }
  }, [dbPath])

  const restoreBackup = useCallback(async (backupPath) => {
    if (!dbPath || !backupPath) return
    await _closeDb()
    try {
      await copyFile(backupPath, dbPath)
      // Remove WAL/SHM files to avoid conflicts
      try { if (await exists(dbPath + '-wal')) await remove(dbPath + '-wal') } catch {}
      try { if (await exists(dbPath + '-shm')) await remove(dbPath + '-shm') } catch {}
    } catch (e) {
      console.error('Failed to restore backup:', e)
    }
    _reinit()
  }, [dbPath, _closeDb, _reinit])

  return {
    tasks, lists, tags, flows, flowMeta, personas,
    addTask, updateTask, bulkStatus, bulkCycle, bulkDelete, bulkPriority, bulkDueShift, bulkSnooze, bulkAssignToday,
    updateFlow, deleteFlow,
    importRtm, clearAll, loadDemoData,
    undo, canUndo: history.length > 0,
    metaSettings, saveMeta,
    dbPath, revealDb, openNewDb, moveCurrentDb,
    createBackup, listBackups, restoreBackup,
    openUrl: (url) => openUrl(url),
  }
}
