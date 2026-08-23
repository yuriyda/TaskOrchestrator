/**
 * SQLite-backed task store (React hook) — the primary persistence layer for Tauri desktop app.
 * Orchestrates domain sub-hooks: planner, sync/gdrive, DB maintenance/backup.
 * Task CRUD, bulk ops, undo, flow meta, and import stay inline (core domain).
 * Conforms to the StoreApi contract defined in store/storeApi.js and types.ts.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import Database from '@tauri-apps/plugin-sql'
import { appDataDir, join } from '@tauri-apps/api/path'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ulid } from './ulid.js'
import { safeIsoDate, localDateStr, localIsoDate } from './core/date.js'
import { handleTaskDone, handleTaskUndone, isTaskBlocked, computeNextCycleStatus, findRecurringDuplicates } from './core/taskActions.js'
import { MIGRATIONS_V1, VERSIONED_MIGRATIONS, LATEST_SCHEMA_VERSION } from './store/migrations.js'
import { TASK_INSERT, TASK_INSERT_IGN, taskToRow, touchUpdatedAt, shiftDue, fetchAll, buildSqlOps, logChange, nextLamport } from './store/helpers.js'
import { DB_PATH_KEY, resolveDbPath, backupBeforeMigration } from './store/backup.js'
import { createSafeOpenUrl } from './store/storeApi.js'
import { usePlannerOps } from './store/usePlannerOps.js'
import { useSyncOps } from './store/useSyncOps.js'
import { useDbOps } from './store/useDbOps.js'
import { runLookupGc } from './core/lookup'
import { createSqliteLookupAdapter } from './store/lookupAdapter'
import { saveNotes as sharedSaveNotes } from '../../shared/core/saveNotes'
import { createSqliteNoteAdapter } from './store/noteAdapter'

// ─── DB singleton ─────────────────────────────────────────────────────────────

const HISTORY_LIMIT = 5

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

  // Post-migration hooks for versions that need extra data backfill
  const postMigrate: Record<number, () => Promise<void>> = {
    6: async () => {
      try { await _db.execute("UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL") } catch {}
      const [devRow] = await _db.select("SELECT value FROM meta WHERE key='device_id'")
      if (!devRow) await _db.execute("INSERT OR REPLACE INTO meta VALUES ('device_id', ?)", [ulid()])
    },
    7: async () => {
      const [devRow] = await _db.select("SELECT value FROM meta WHERE key='device_id'")
      if (devRow) await _db.execute('INSERT OR IGNORE INTO vector_clock (device_id, counter) VALUES (?, 0)', [devRow.value])
      try { await _db.execute("UPDATE tasks SET lamport_ts = rowid WHERE lamport_ts = 0") } catch {}
    },
    13: async () => {
      // One-shot data fix: soft-delete duplicate active instances of recurring
      // RTM series (RTM import artifacts + pre-2.6.0 double-completion spawns).
      // Soft-delete (not hard) so the cleanup propagates to other devices via sync.
      try {
        const rows = await _db.select('SELECT id, rtm_series_id, recurrence, status, created_at, deleted_at FROM tasks')
        const dupIds = findRecurringDuplicates(rows)
        if (!dupIds.length) return
        const [devRow] = await _db.select("SELECT value FROM meta WHERE key='device_id'")
        const did = devRow?.value
        if (!did) return // fresh DB without device_id — nothing accumulated yet
        const lts = await nextLamport(_db, did)
        const now = new Date().toISOString()
        for (const id of dupIds) {
          await _db.execute(
            'UPDATE tasks SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?',
            [now, now, lts, did, id]
          )
          await logChange(_db, 'tasks', id, 'update', { deletedAt: now }, lts, did)
        }
        console.log(`[migration v13] soft-deleted ${dupIds.length} duplicate recurring instance(s)`)
      } catch (err) {
        console.warn('[migration v13] dedupe failed:', err)
      }
    },
  }

  for (let v = 2; v <= LATEST_SCHEMA_VERSION; v++) {
    if (version >= v) continue
    const stmts = VERSIONED_MIGRATIONS[v]
    if (!stmts) continue
    for (const sql of stmts) {
      try { await _db.execute(sql) } catch (err: any) {
        // Expected: ALTER TABLE ADD COLUMN on already-migrated DB, CREATE IF NOT EXISTS, etc.
        if (!err?.message?.includes('already exists') && !err?.message?.includes('duplicate'))
          console.warn(`Migration v${v} warning:`, err?.message || err)
      }
    }
    if (postMigrate[v]) await postMigrate[v]()
    await _db.execute(`INSERT OR REPLACE INTO meta VALUES ('schema_version','${v}')`)
  }

  return _db
}

// ─── Instance registry ────────────────────────────────────────────────────────
// A tiny SQLite file at the FIXED appDataDir (independent of the tasks-DB
// location, which can be custom): each running app instance keeps a row
// {session_id, db_path, app_version, heartbeat_at} fresh so external agents
// (skills/task-orchestrator-db) can discover which database each instance has
// open and that this version live-refreshes external changes. Heartbeat every
// 10s; agents treat rows older than ~30s as crashed leftovers and ignore them.

const SESSION_ID = ulid()
let _registryDb = null
let _appVersion = null
let _pid = null

async function openRegistry() {
  if (_registryDb) return _registryDb
  _registryDb = await Database.load('sqlite:instances.db')
  await _registryDb.execute(`CREATE TABLE IF NOT EXISTS instances (
    session_id TEXT PRIMARY KEY, db_path TEXT NOT NULL,
    app_version TEXT, heartbeat_at TEXT NOT NULL, pid INTEGER)`)
  // Upgrade a registry created before the pid column existed
  try { await _registryDb.execute('ALTER TABLE instances ADD COLUMN pid INTEGER') } catch {}
  return _registryDb
}

async function registryUpsert(dbPath) {
  try {
    const reg = await openRegistry()
    if (!_appVersion) { try { _appVersion = await getVersion() } catch { _appVersion = 'unknown' } }
    // The pid lets agents validate this row against the live process list —
    // heartbeats alone go stale when the window is minimized (timer throttling).
    if (_pid === null) { try { _pid = await invoke('get_pid') } catch { _pid = null } }
    // GC rows left behind by crashed instances (generous window: heartbeats
    // are throttled in background windows; agents key on pid anyway)
    await reg.execute('DELETE FROM instances WHERE heartbeat_at < ?', [new Date(Date.now() - 24 * 3600_000).toISOString()])
    await reg.execute(
      'INSERT OR REPLACE INTO instances (session_id, db_path, app_version, heartbeat_at, pid) VALUES (?,?,?,?,?)',
      [SESSION_ID, dbPath, _appVersion, new Date().toISOString(), _pid]
    )
  } catch (e) { console.warn('[registry] upsert failed:', e) }
}

async function registryRemove() {
  try {
    const reg = await openRegistry()
    await reg.execute('DELETE FROM instances WHERE session_id = ?', [SESSION_ID])
  } catch {}
}

// Sum of vector_clock counters of all OTHER devices — grows only when an
// external writer (agent CLI / MCP) or a sync import commits. Cheap (~6 rows).
async function readForeignClock(db, did) {
  const [row] = await db.select('SELECT TOTAL(counter) AS t FROM vector_clock WHERE device_id != ?', [did || ''])
  return Number(row?.t) || 0
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
  // External-change signal for the UI (toast): {kind:'refresh'|'undoBlocked', ts}
  const [externalNotice, setExternalNotice] = useState(null)
  const dbRef = useRef(null)
  const deviceIdRef = useRef(null)
  const slotsRef = useRef([])
  const currentPlanIdRef = useRef(null)
  const plannerRef = useRef(null)
  // Baseline for external-write detection: TOTAL(counter) over vector_clock rows
  // of OTHER devices. Our own mutations bump only our own device's counter, so
  // any growth here means an external agent wrote (or a sync import ran — those
  // call refreshExternalBaseline themselves). null = baseline not set yet.
  const externalClockRef = useRef(null)
  const heartbeatRef = useRef(null)

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    externalClockRef.current = null // reset baseline on DB switch
    openDb().then(async db => {
      dbRef.current = db

      // Cache device_id for sync_log writes
      const [devRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")
      deviceIdRef.current = devRow?.value || null

      // Hygiene: drop the short-lived pre-release capability flag — superseded
      // by the instance registry (registryUpsert below), which is per-instance
      // and can't go stale after a downgrade.
      try { await db.execute("DELETE FROM meta WHERE key='external_writes_safe'") } catch {}

      // GC orphaned lookup entries before first render — lookups are derived per device.
      // See shared/core/lookup.ts for rules (flow_meta keeps a flow name alive).
      try { await runLookupGc(createSqliteLookupAdapter(db)) } catch (e) { console.warn('[lookup gc] init failed', e) }

      // Resolve and expose the current DB path
      let resolvedDbPath = localStorage.getItem(DB_PATH_KEY)
      if (!resolvedDbPath) {
        try {
          const dir = await appDataDir()
          resolvedDbPath = await join(dir, 'tasks.db')
        } catch { resolvedDbPath = 'tasks.db' }
      }
      setDbPath(resolvedDbPath)

      // Announce this instance (and which DB it has open) to external agents.
      await registryUpsert(resolvedDbPath)
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => { registryUpsert(resolvedDbPath) }, 10_000)

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
      planner.refreshPlannedTaskIds()

      // Load persisted app settings from meta table
      const metaRows = await db.select(
        "SELECT key, value FROM meta WHERE key IN ('to_locale', 'to_theme', 'to_settings', 'to_guide_completed', 'focus_state_v1')"
      )
      const meta = {}
      for (const row of metaRows) meta[row.key] = row.value
      setMetaSettings(meta)

      // Baseline for external-write detection (see externalClockRef).
      try { externalClockRef.current = await readForeignClock(db, deviceIdRef.current) } catch {}
    }).catch(console.error)
    return () => clearInterval(heartbeatRef.current)
  }, [dbKey])

  // Deregister this instance on window close (best effort — a crashed process
  // leaves a row behind, which agents ignore once its heartbeat goes stale).
  useEffect(() => {
    const bye = () => { registryRemove() }
    window.addEventListener('beforeunload', bye)
    return () => window.removeEventListener('beforeunload', bye)
  }, [])

  // WAL checkpoint happens in _closeDb() which is called on DB switch/move.
  // beforeunload is unreliable for async operations in Tauri WebView.

  // ── Mutation wrapper ───────────────────────────────────────────────────────
  const mutate = useCallback(async (currentTasks, fn) => {
    const db = dbRef.current
    if (!db) return
    setHistory(h => [...h.slice(-HISTORY_LIMIT), { tasks: currentTasks, slots: slotsRef.current, planId: currentPlanIdRef.current }])
    const result = await fn(db)
    setTasks(await fetchAll(db))
    return result
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

  // ── External writes (agent CLI / MCP): detection & live refresh ───────────
  // Called after sync imports: they legitimately raise foreign counters, so the
  // detector must re-baseline — and the undo history must go, because undoing
  // across freshly imported (or concurrently agent-written) rows would restore
  // a stale snapshot and hard-delete tasks the snapshot has never seen.
  const refreshExternalBaseline = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    try { externalClockRef.current = await readForeignClock(db, deviceIdRef.current) } catch {}
    setHistory([])
  }, [])

  const applyExternalRefresh = useCallback(async (db, kind) => {
    setTasks(await fetchAll(db))
    await refreshRef()
    const p = plannerRef.current
    if (p) { await p.plannerRefreshSlots(); await p.refreshPlannedTaskIds() }
    // Undo across external changes would restore a stale snapshot and
    // hard-delete rows it has never seen — drop the history instead.
    setHistory([])
    setExternalNotice({ kind, ts: Date.now() })
  }, [refreshRef])

  const checkInFlightRef = useRef(false)
  const checkExternalChanges = useCallback(async () => {
    // Interval + focus + visibility can fire together — one check at a time.
    if (checkInFlightRef.current) return false
    checkInFlightRef.current = true
    try {
      const db = dbRef.current
      if (!db) return false
      let t
      try { t = await readForeignClock(db, deviceIdRef.current) } catch { return false }
      if (externalClockRef.current === null) { externalClockRef.current = t; return false }
      if (t <= externalClockRef.current) return false
      externalClockRef.current = t
      await applyExternalRefresh(db, 'refresh')
      return true
    } finally { checkInFlightRef.current = false }
  }, [applyExternalRefresh])

  // Poll every 3s + re-check on window focus/visibility — fast feedback when
  // the user switches back from the agent's window. Same wake-up pattern as
  // the midnight date rollover in TaskOrchestrator.tsx.
  useEffect(() => {
    const iv = setInterval(() => { checkExternalChanges() }, 3000)
    const onFocus = () => { checkExternalChanges() }
    const onVisibility = () => { if (document.visibilityState === 'visible') checkExternalChanges() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkExternalChanges])

  // ── Sub-hooks (must be before inline code that uses their state/setters) ──
  const pushHistory = useCallback((currentTasks) => {
    setHistory(h => [...h.slice(-HISTORY_LIMIT), { tasks: currentTasks, slots: slotsRef.current, planId: currentPlanIdRef.current }])
  }, [])

  const planner = usePlannerOps({ dbRef, deviceIdRef, pushHistory })
  const syncOps = useSyncOps({ dbRef, deviceIdRef, setTasks, setMetaSettings, refreshRef, refreshExternalBaseline })

  // Keep refs in sync with planner state — used by pushHistory/undo for slot-level history
  useEffect(() => { slotsRef.current = planner.dayPlanSlots }, [planner.dayPlanSlots])
  useEffect(() => { currentPlanIdRef.current = planner.currentPlan?.id || null }, [planner.currentPlan?.id])
  // Undo captures `planner` at first render (empty deps) — stash via ref so we
  // read the latest plannerRefreshSlots (depends on currentPlan) on each call.
  useEffect(() => { plannerRef.current = planner })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addTask = useCallback((data, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const task = {
      id: ulid(), title: data.title || '', status: data.status || 'inbox',
      priority: data.priority || 4, list: data.list || null,
      due: data.due || null, recurrence: data.recurrence || null,
      flowId: data.flowId || null, dependsOn: data.dependsOn || null,
      tags: data.tags || [], personas: data.personas || [],
      url: data.url || null, dateStart: data.dateStart || null,
      estimate: data.estimate || null, postponed: 0, rtmSeriesId: null,
      createdAt: new Date().toISOString(), lamportTs: lts, deviceId: did,
    }
    // No DB transactions available (@tauri-apps/plugin-sql limitation);
    // logChange calls kept together with their DB writes to minimise inconsistency window.
    await db.execute(TASK_INSERT, taskToRow(task))
    await logChange(db, 'tasks', task.id, 'insert', task, lts, did)
    if (task.list) {
      await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
      await logChange(db, 'lists', task.list, 'insert', { name: task.list }, lts, did)
    }
    for (const t of task.tags) {
      await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [t])
      await logChange(db, 'tags', t, 'insert', { name: t }, lts, did)
    }
    for (const p of task.personas) {
      await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
      await logChange(db, 'personas', p, 'insert', { name: p }, lts, did)
    }
    if (task.flowId) {
      await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [task.flowId])
      await logChange(db, 'flows', task.flowId, 'insert', { name: task.flowId }, lts, did)
    }
    await refreshRef()
    return task
  }), [mutate, refreshRef])

  const bulkStatus = useCallback((ids, status, cur) => {
    let activatedNames = []
    let skippedBlocked = 0
    const promise = mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const ops = buildSqlOps(db, logChange)

      const changedIds = []
      if (status === 'active' || status === 'done') {
        for (const id of [...ids]) {
          if (await isTaskBlocked(ops, id)) { skippedBlocked++; continue }
          const [prevRow] = await db.select('SELECT status FROM tasks WHERE id=?', [id])
          const prevStatus = prevRow?.status ?? null
          await db.execute('UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id=?', [status, lts, did, id])
          changedIds.push(id)
          if (status === 'done') {
            // Keep the original completion time when re-marking an already-done task
            if (prevStatus !== 'done') {
              await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [new Date().toISOString(), id])
            }
            const doneResult = await handleTaskDone(ops, id, ulid, lts, did, prevStatus)
            if (doneResult.spawned && !doneResult.resurrected) {
              await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
            }
            activatedNames.push(...doneResult.activated.map(a => a.title))
          } else {
            await db.execute('UPDATE tasks SET completed_at=NULL WHERE id=?', [id])
            // Completion revert — remove the spawned occurrence while untouched
            if (prevStatus === 'done') await handleTaskUndone(ops, id, lts, did)
          }
          await logChange(db, 'tasks', id, 'update', { status }, lts, did)
        }
      } else {
        const ph = [...ids].map(() => '?').join(',')
        const doneRows = await db.select(`SELECT id FROM tasks WHERE status='done' AND id IN (${ph})`, [...ids])
        await db.execute(`UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id IN (${ph})`, [status, lts, did, ...[...ids]])
        await db.execute(`UPDATE tasks SET completed_at=NULL WHERE id IN (${ph})`, [...ids])
        changedIds.push(...ids)
        // done → inbox/cancelled is also a completion revert
        for (const row of doneRows) {
          await handleTaskUndone(ops, row.id, lts, did)
        }
        for (const id of changedIds) {
          await logChange(db, 'tasks', id, 'update', { status }, lts, did)
        }
      }
      await touchUpdatedAt(db, ids)
    })
    return promise.then(() => ({ activated: activatedNames, skippedBlocked }))
  }, [mutate])

  const bulkCycle = useCallback((ids, cur) => {
    let activatedNames = []
    const promise = mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const ops = buildSqlOps(db, logChange)
      for (const id of ids) {
        const [row] = await db.select('SELECT status, depends_on FROM tasks WHERE id=?', [id])
        if (!row) continue
        const blocked = await isTaskBlocked(ops, id)
        const next = computeNextCycleStatus(row.status, blocked)
        await db.execute('UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id=?', [next, lts, did, id])
        await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [next === 'done' ? new Date().toISOString() : null, id])
        if (next === 'done') {
          const doneResult = await handleTaskDone(ops, id, ulid, lts, did, row.status)
          if (doneResult.spawned && !doneResult.resurrected) {
            await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
          }
          activatedNames.push(...doneResult.activated.map(a => a.title))
        } else if (row.status === 'done') {
          // Cycled away from done — completion revert, drop the untouched spawn
          await handleTaskUndone(ops, id, lts, did)
        }
        await logChange(db, 'tasks', id, 'update', { status: next }, lts, did)
      }
      await touchUpdatedAt(db, ids)
    })
    return promise.then(() => ({ activated: activatedNames }))
  }, [mutate])

  const bulkDelete = useCallback(async (ids, cur) => {
    const idArr = [...ids]
    const deletedIds = new Set(idArr)
    const ph    = idArr.map(() => '?').join(',')
    await mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const now = new Date().toISOString()
      // Soft-delete: set deleted_at instead of removing rows (for sync propagation)
      await db.execute(
        `UPDATE tasks SET deleted_at=?, lamport_ts=?, device_id=?, updated_at=? WHERE id IN (${ph})`,
        [now, lts, did, now, ...idArr]
      )
      for (const id of idArr) {
        await logChange(db, 'tasks', id, 'delete', null, lts, did)
      }
      // Clean up orphaned lookup entries (only count non-deleted tasks).
      // Inline SQL here (not runLookupGc) is deliberate: single set-based
      // DELETE per kind is faster than round-tripping adapter calls for a
      // batch delete. Rules mirror shared/core/lookup.ts — keep in sync if
      // you change either. Don't "refactor for consistency" with updateTask;
      // that path uses runLookupGc because it handles one task at a time.
      await db.execute(`DELETE FROM lists    WHERE name NOT IN (SELECT DISTINCT list_name FROM tasks WHERE list_name IS NOT NULL AND deleted_at IS NULL)`)
      await db.execute(`DELETE FROM flows    WHERE name NOT IN (SELECT DISTINCT flow_id FROM tasks WHERE flow_id IS NOT NULL AND deleted_at IS NULL) AND name NOT IN (SELECT name FROM flow_meta)`)
      await db.execute(`DELETE FROM tags     WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.tags) WHERE tasks.deleted_at IS NULL)`)
      await db.execute(`DELETE FROM personas WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.personas) WHERE tasks.deleted_at IS NULL)`)
      // Clean planner slots for soft-deleted tasks
      await db.execute(
        `DELETE FROM day_plan_slots WHERE task_id IN (${ph})`,
        idArr
      )
    })
    await refreshRef()
    // Remove deleted tasks' slots from React state immediately
    planner.setDayPlanSlots(s => s.filter(slot => !slot.taskId || !deletedIds.has(slot.taskId)))
  }, [mutate, refreshRef])

  const bulkPriority = useCallback((ids, priority, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const ph = [...ids].map(() => '?').join(',')
    await db.execute(`UPDATE tasks SET priority=?, lamport_ts=?, device_id=? WHERE id IN (${ph})`, [priority, lts, did, ...[...ids]])
    await touchUpdatedAt(db, ids)
    for (const id of ids) {
      await logChange(db, 'tasks', id, 'update', { priority }, lts, did)
    }
  }), [mutate])

  const bulkDueShift = useCallback((ids, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    for (const id of ids) {
      const [row] = await db.select('SELECT due FROM tasks WHERE id=?', [id])
      if (!row) continue
      const newDue = shiftDue(row.due)
      await db.execute('UPDATE tasks SET due=?, postponed=COALESCE(postponed,0)+1, lamport_ts=?, device_id=? WHERE id=?', [newDue, lts, did, id])
      await logChange(db, 'tasks', id, 'update', { due: newDue }, lts, did)
    }
    await touchUpdatedAt(db, ids)
  }), [mutate])

  // Snooze: shift due by `days` days and/or `months` months; increment postponed by 1.
  // If the task has no due date, base is today.
  const bulkSnooze = useCallback((ids, days, months, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const today = localIsoDate(new Date())
    for (const id of ids) {
      const [row] = await db.select('SELECT due FROM tasks WHERE id=?', [id])
      if (!row) continue
      const base = (row.due && /^\d{4}-\d{2}-\d{2}$/.test(row.due))
        ? new Date(row.due + 'T12:00:00')
        : new Date(today + 'T12:00:00')
      if (months) base.setMonth(base.getMonth() + months)
      if (days)   base.setDate(base.getDate() + days)
      const newDue = localIsoDate(base)
      await db.execute('UPDATE tasks SET due=?, postponed=COALESCE(postponed,0)+1, lamport_ts=?, device_id=? WHERE id=?', [newDue, lts, did, id])
      await logChange(db, 'tasks', id, 'update', { due: newDue }, lts, did)
    }
    await touchUpdatedAt(db, ids)
  }), [mutate])

  const bulkAssignToday = useCallback((ids, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const ops = buildSqlOps(db, logChange)
    const today = localIsoDate(new Date())
    for (const id of ids) {
      const [prevRow] = await db.select('SELECT status FROM tasks WHERE id=?', [id])
      await db.execute("UPDATE tasks SET status='active', due=?, lamport_ts=?, device_id=? WHERE id=?", [today, lts, did, id])
      // done → active is a completion revert — drop the untouched spawn
      if (prevRow?.status === 'done') await handleTaskUndone(ops, id, lts, did)
      await logChange(db, 'tasks', id, 'update', { status: 'active', due: today }, lts, did)
    }
    await touchUpdatedAt(db, ids)
  }), [mutate])

  // ── Update single task ─────────────────────────────────────────────────────
  const updateTask = useCallback((id, changes, cur) => {
    let activatedNames = []
    const promise = mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    // Previous status — completion side-effects (spawn / revert cleanup) must
    // only fire on actual transitions, not on saves that re-send status='done'.
    const [prevRow] = await db.select('SELECT status FROM tasks WHERE id=?', [id])
    const prevStatus = prevRow?.status ?? null
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
    const NULLABLE_JSON_COLS = new Set(['dependsOn'])
    const DATE_COLS = new Set(['due', 'dateStart'])
    for (const [key, val] of Object.entries(changes)) {
      const col = COL[key]
      if (!col) continue
      setClauses.push(`${col} = ?`)
      const v = DATE_COLS.has(key) ? safeIsoDate(val) :
        JSON_COLS.has(key) ? JSON.stringify(val ?? []) :
        NULLABLE_JSON_COLS.has(key) ? (Array.isArray(val) && val.length ? JSON.stringify(val) : null) :
        (val ?? null)
      values.push(v)
    }
    // Always update updated_at and lamport_ts on any change
    setClauses.push('updated_at = ?')
    values.push(new Date().toISOString())
    setClauses.push('lamport_ts = ?')
    values.push(lts)
    setClauses.push('device_id = ?')
    values.push(did)
    if (setClauses.length) {
      values.push(id)
      await db.execute(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`, values)
    }
    // Auto-set completed_at when status changes (keep original time on done → done)
    if (changes.status === 'done' && prevStatus !== 'done') {
      try { await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [new Date().toISOString(), id]) } catch (_) {}
    } else if (changes.status && changes.status !== 'done') {
      try { await db.execute('UPDATE tasks SET completed_at=NULL WHERE id=?', [id]) } catch (_) {}
    }
    if (changes.list)     await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [changes.list])
    if (changes.tags)     for (const tag of changes.tags)         await db.execute('INSERT OR IGNORE INTO tags     VALUES (?)', [tag])
    if (changes.personas) for (const p   of changes.personas)     await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
    if (changes.flowId)   await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [changes.flowId])
    if (changes.status === 'done') {
      const ops = buildSqlOps(db, logChange)
      const doneResult = await handleTaskDone(ops, id, ulid, lts, did, prevStatus)
      if (doneResult.spawned && !doneResult.resurrected) {
        await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
      }
      activatedNames.push(...doneResult.activated.map(a => a.title))
    } else if (prevStatus === 'done' && changes.status && changes.status !== 'done') {
      // Completion revert (checkbox uncheck / edit-dialog save with stale
      // status) — drop the occurrence spawned by the completion while untouched.
      const ops = buildSqlOps(db, logChange)
      await handleTaskUndone(ops, id, lts, did)
    }
    // Note sync — delegated to shared/core/saveNotes.ts via SQLite adapter.
    // Pass outer lts/did so all rows (task UPDATE + notes) share a single
    // lamport; logChange hooks keep the delta log intact (desktop-only).
    if (changes.notes !== undefined) {
      const adapter = createSqliteNoteAdapter(db, did)
      await sharedSaveNotes(adapter, id, changes.notes || [], { overrideLts: lts, overrideDid: did })
    }
    await logChange(db, 'tasks', id, 'update', changes, lts, did)
    // Incremental lookup GC — dropping a field (list/tags/personas/flowId) may
    // have orphaned an entry. Runs only when the changeset touches one of those
    // fields to keep the hot path fast.
    if ('list' in changes || 'tags' in changes || 'personas' in changes || 'flowId' in changes) {
      await runLookupGc(createSqliteLookupAdapter(db))
    }
    await refreshRef()
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
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    let inserted = 0
    {
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
          lamportTs:    lts,
        }
        await db.execute(TASK_INSERT_IGN, taskToRow(task))
        await logChange(db, 'tasks', task.id, 'insert', task, lts, did)
        if (task.list) await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
        for (const tag of task.tags) await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [tag])
        inserted++
        if (onProgress) onProgress(inserted, total)
      }

      for (const n of (jsonData.notes || [])) {
        await db.execute(
          'INSERT OR IGNORE INTO notes (id, task_series_id, content, created_at) VALUES (?,?,?,?)',
          [n.id, n.series_id, n.content || '', n.date_created]
        )
      }
    }

    // Refresh state
    setTasks(await fetchAll(db))
    await refreshRef()

    return { imported: tasksToImport.length, skipped: rtmTasks.length - tasksToImport.length }
  }, [refreshRef])

  // ── Load demo data ─────────────────────────────────────────────────────────
  const loadDemoData = useCallback(async (data) => {
    const db = dbRef.current
    if (!db || !data) return
    const did = deviceIdRef.current
    const { tasks: demoTasks, lists: demoLists, tags: demoTags, flows: demoFlows, personas: demoPersonas } = data

    {
      for (const n of demoLists) {
        const lts = await nextLamport(db, did)
        await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [n])
        await logChange(db, 'lists', n, 'insert', { name: n }, lts, did)
      }
      for (const n of demoTags) {
        const lts = await nextLamport(db, did)
        await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [n])
        await logChange(db, 'tags', n, 'insert', { name: n }, lts, did)
      }
      for (const n of demoFlows) {
        const lts = await nextLamport(db, did)
        await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [n])
        await logChange(db, 'flows', n, 'insert', { name: n }, lts, did)
      }
      for (const n of demoPersonas) {
        const lts = await nextLamport(db, did)
        await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [n])
        await logChange(db, 'personas', n, 'insert', { name: n }, lts, did)
      }

      for (const task of demoTasks) {
        const lts = await nextLamport(db, did)
        task.lamportTs = lts
        task.deviceId = did
        await db.execute(TASK_INSERT_IGN, taskToRow(task))
        await logChange(db, 'tasks', task.id, 'insert', task, lts, did)
        if (task.rtmSeriesId && task.notes?.length) {
          for (const note of task.notes) {
            const nLts = await nextLamport(db, did)
            await db.execute(
              'INSERT OR IGNORE INTO notes (id, task_series_id, content, created_at) VALUES (?,?,?,?)',
              [note.id, task.rtmSeriesId, note.content || '', new Date(note.createdAt).getTime()]
            )
            await logChange(db, 'notes', note.id, 'insert', note, nLts, did)
          }
        }
      }
    }

    setTasks(await fetchAll(db))
    await refreshRef()
  }, [refreshRef])

  // ── Flow meta CRUD ─────────────────────────────────────────────────────────
  const updateFlow = useCallback(async (name, changes) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    // Ensure flow exists in flows table
    await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [name])
    // Upsert flow_meta
    const existing = await db.select('SELECT * FROM flow_meta WHERE name=?', [name])
    if (existing.length === 0) {
      await db.execute(
        'INSERT INTO flow_meta (name, description, color, deadline) VALUES (?,?,?,?)',
        [name, changes.description || '', changes.color || '', changes.deadline || null]
      )
      await logChange(db, 'flow_meta', name, 'insert', { name, ...changes }, lts, did)
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
      await logChange(db, 'flow_meta', name, 'update', changes, lts, did)
    }
    await refreshRef()
  }, [refreshRef])

  const deleteFlow = useCallback(async (name) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    await db.execute('DELETE FROM flow_meta WHERE name=?', [name])
    await db.execute('DELETE FROM flows WHERE name=?', [name])
    // Clear flowId on tasks that reference this flow
    const affected = await db.select('SELECT id FROM tasks WHERE flow_id=?', [name])
    await db.execute('UPDATE tasks SET flow_id=NULL, lamport_ts=?, device_id=? WHERE flow_id=?', [lts, did, name])
    await logChange(db, 'flow_meta', name, 'delete', null, lts, did)
    await logChange(db, 'flows', name, 'delete', null, lts, did)
    for (const row of affected) {
      await logChange(db, 'tasks', row.id, 'update', { flowId: null }, lts, did)
    }
    setTasks(await fetchAll(db))
    await refreshRef()
  }, [refreshRef])

  // ── Meta settings persistence ──────────────────────────────────────────────
  const saveMeta = useCallback(async (key, value) => {
    const db = dbRef.current
    if (!db) return
    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [key, value])
    setMetaSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  // ── Clear All ──────────────────────────────────────────────────────────────
  const clearAll = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await db.execute('DELETE FROM day_plan_slots')
    await db.execute('DELETE FROM day_plans')
    await db.execute('DELETE FROM tasks')
    await db.execute('DELETE FROM notes')
    await db.execute('DELETE FROM tags')
    await db.execute('DELETE FROM lists')
    await db.execute('DELETE FROM flows')
    await db.execute('DELETE FROM flow_meta')
    await db.execute('DELETE FROM personas')
    await db.execute('DELETE FROM sync_activity_log')
    // sync_log and vector_clock are NOT cleared — clearAll is a local operation.
    // Sync data survives so that next sync can restore tasks from cloud.
    try { await db.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
    setTasks([])
    setTags([])
    setLists([])
    setFlows([])
    setFlowMeta({})
    setPersonas([])
    setHistory([])
  }, [refreshRef])

  // ── DB maintenance + backup (delegated to useDbOps) ────────────────────────
  const { revealDb, openNewDb, createNewDb, moveCurrentDb, createBackup, listBackups, restoreBackup } = useDbOps({
    dbRef, dbPath,
    resetDbSingleton: () => { _db = null },
    resetAllState: () => { setTasks([]); setLists([]); setTags([]); setFlows([]); setFlowMeta({}); setPersonas([]); setHistory([]) },
    setDbKey,
  })

  // ── Undo ───────────────────────────────────────────────────────────────────
  const undo = useCallback((onDone) => {
    ;(async () => {
      // External-change guard: the snapshot predates writes made by an external
      // agent (or a sync import) — restoring it would clobber those rows and
      // hard-delete tasks it has never seen. Refresh instead and drop history.
      const db = dbRef.current
      if (db && externalClockRef.current !== null) {
        let t = null
        try { t = await readForeignClock(db, deviceIdRef.current) } catch {}
        if (t !== null && t > externalClockRef.current) {
          externalClockRef.current = t
          await applyExternalRefresh(db, 'undoBlocked')
          return
        }
      }
      doUndo(onDone)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doUndo = useCallback((onDone) => {
    setHistory(h => {
      if (h.length === 0) return h
      const entry = h[h.length - 1]
      // Backward compat: older entries were plain tasks[]
      const prev = Array.isArray(entry) ? entry : entry.tasks
      const prevSlots = Array.isArray(entry) ? [] : (entry.slots || [])
      const snapshotPlanId = Array.isArray(entry) ? null : (entry.planId || null)
      ;(async () => {
        const db = dbRef.current
        if (!db) return
        // Build diff: avoid DELETE FROM tasks which triggers FK cascade
        // and destroys day_plan_slots.task_id references
        const prevIds = new Set(prev.map(t => t.id))
        // Include ALL tasks (even soft-deleted) so undo can restore them via UPDATE
        const currentRows = await db.select('SELECT id FROM tasks')
        const currentIds = new Set(currentRows.map(r => r.id))

        // 1. Hard-delete tasks added after snapshot + their planner slots
        for (const row of currentRows) {
          if (!prevIds.has(row.id)) {
            await db.execute("DELETE FROM day_plan_slots WHERE task_id = ?", [row.id])
            await db.execute('DELETE FROM tasks WHERE id = ?', [row.id])
          }
        }
        // 2. Upsert snapshot tasks: UPDATE existing (including soft-deleted), INSERT truly missing
        const sets = 'title=?, status=?, priority=?, list_name=?, due=?, recurrence=?, flow_id=?, depends_on=?, tags=?, personas=?, url=?, date_start=?, estimate=?, postponed=?, completed_at=?, updated_at=?, deleted_at=?, lamport_ts=?, device_id=?'
        for (const task of prev) {
          const vals = [
            task.title, task.status || 'inbox', task.priority || 4,
            task.list || null, task.due || null,
            task.recurrence || null, task.flowId || null, task.dependsOn?.length ? JSON.stringify(task.dependsOn) : null,
            JSON.stringify(task.tags || []), JSON.stringify(task.personas || []),
            task.url || null, task.dateStart || null, task.estimate || null, task.postponed || 0,
            task.completedAt || null, task.updatedAt || null,
            null /* deleted_at — always restore as non-deleted */, task.lamportTs || 0, task.deviceId || null,
            task.id,
          ]
          if (currentIds.has(task.id)) {
            await db.execute(`UPDATE tasks SET ${sets} WHERE id = ?`, vals)
          } else {
            await db.execute(TASK_INSERT, taskToRow(task))
          }
        }

        // 3. Restore planner slots — scoped to the plan that was active at snapshot time.
        // Recurring slots from other plans (planId !== snapshotPlanId) are skipped — they
        // belong to other plans' history and must not be touched here.
        if (snapshotPlanId) {
          const ownPrevSlots = prevSlots.filter(s => s.planId === snapshotPlanId)
          const prevSlotIds = new Set(ownPrevSlots.map(s => s.id))
          const currentSlotRows = await db.select('SELECT id FROM day_plan_slots WHERE plan_id = ?', [snapshotPlanId])
          const currentSlotIds = new Set(currentSlotRows.map(r => r.id))
          for (const row of currentSlotRows) {
            if (!prevSlotIds.has(row.id)) {
              await db.execute('DELETE FROM day_plan_slots WHERE id = ?', [row.id])
            }
          }
          const slotSets = 'plan_id=?, task_id=?, title=?, start_time=?, end_time=?, slot_type=?, sort_order=?, recurrence=?, created_at=?, device_id=?, lamport_ts=?'
          for (const slot of ownPrevSlots) {
            const slotVals = [
              slot.planId, slot.taskId ?? null, slot.title ?? null,
              slot.startTime, slot.endTime, slot.slotType || 'task',
              slot.sortOrder || 0, slot.recurrence ?? null,
              slot.createdAt || new Date().toISOString(),
              slot.deviceId ?? null, slot.lamportTs || 0,
            ]
            try {
              if (currentSlotIds.has(slot.id)) {
                await db.execute(`UPDATE day_plan_slots SET ${slotSets} WHERE id = ?`, [...slotVals, slot.id])
              } else {
                await db.execute(
                  'INSERT INTO day_plan_slots (id, plan_id, task_id, title, start_time, end_time, slot_type, sort_order, recurrence, created_at, device_id, lamport_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                  [slot.id, ...slotVals]
                )
              }
            } catch (e) {
              console.warn('[undo] failed to restore slot', slot.id, e)
            }
          }
        }

        setTasks(prev)
        // Re-read slots from DB for the currently-viewed plan instead of setting stale snapshot;
        // also refresh plannedTaskIds so task-list highlighting stays in sync.
        // Access via plannerRef because `undo` was captured with empty deps and
        // `plannerRefreshSlots` depends on the live `currentPlan` state.
        const p = plannerRef.current
        if (p) {
          await p.plannerRefreshSlots()
          await p.refreshPlannedTaskIds()
        }
        if (onDone) onDone()
      })()
      return h.slice(0, -1)
    })
  }, [])

  // Manual lookup GC — exposed for the Settings "Clean up unused lookups" button.
  const cleanupLookups = useCallback(async () => {
    const db = dbRef.current
    if (!db) return { removed: { lists: [], tags: [], personas: [], flows: [] } }
    const result = await runLookupGc(createSqliteLookupAdapter(db))
    await refreshRef()
    return result
  }, [refreshRef])

  return {
    tasks, lists, tags, flows, flowMeta, personas,
    addTask, updateTask, bulkStatus, bulkCycle, bulkDelete, bulkPriority, bulkDueShift, bulkSnooze, bulkAssignToday,
    updateFlow, deleteFlow,
    importRtm, clearAll, loadDemoData,
    undo, canUndo: history.length > 0,
    externalNotice,
    metaSettings, saveMeta,
    dbPath, revealDb, openNewDb, createNewDb, moveCurrentDb,
    createBackup, listBackups, restoreBackup,
    cleanupLookups,
    ...syncOps,
    openUrl: createSafeOpenUrl(openUrl),
    // Day Planner
    dayPlanSlots: planner.dayPlanSlots, currentPlan: planner.currentPlan, plannedTaskIds: planner.plannedTaskIds,
    plannerLoadDay: planner.plannerLoadDay, plannerRefreshSlots: planner.plannerRefreshSlots, plannerGetSlotsByDate: planner.plannerGetSlotsByDate,
    plannerAddTaskSlot: planner.plannerAddTaskSlot, plannerAddBlockedSlot: planner.plannerAddBlockedSlot,
    plannerMoveSlot: planner.plannerMoveSlot, plannerResizeSlot: planner.plannerResizeSlot, plannerRemoveSlot: planner.plannerRemoveSlot,
    plannerUpdateSlotTitle: planner.plannerUpdateSlotTitle, plannerUpdateSlotRecurrence: planner.plannerUpdateSlotRecurrence, plannerUpdateHours: planner.plannerUpdateHours,
  }
}
