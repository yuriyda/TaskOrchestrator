/**
 * SQLite-backed task store (React hook) — the primary persistence layer for Tauri desktop app.
 * Orchestrates domain sub-hooks: planner, sync/gdrive, DB maintenance/backup.
 * Task CRUD, bulk ops, undo, flow meta, and import stay inline (core domain).
 * Conforms to the StoreApi contract defined in store/storeApi.js and types.ts.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import Database from '@tauri-apps/plugin-sql'
import { appDataDir, join } from '@tauri-apps/api/path'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ulid } from './ulid.js'
import { safeIsoDate, localDateStr, localIsoDate } from './core/date.js'
import { handleTaskDone, isTaskBlocked, computeNextCycleStatus } from './core/taskActions.js'
import { MIGRATIONS_V1, VERSIONED_MIGRATIONS, LATEST_SCHEMA_VERSION } from './store/migrations.js'
import { TASK_INSERT, TASK_INSERT_IGN, taskToRow, touchUpdatedAt, shiftDue, fetchAll, buildSqlOps, logChange, nextLamport } from './store/helpers.js'
import { DB_PATH_KEY, resolveDbPath, backupBeforeMigration } from './store/backup.js'
import { createSafeOpenUrl } from './store/storeApi.js'
import { usePlannerOps } from './store/usePlannerOps.js'
import { useSyncOps } from './store/useSyncOps.js'
import { useDbOps } from './store/useDbOps.js'
import { runLookupGc } from './core/lookup'
import { createSqliteLookupAdapter } from './store/lookupAdapter'

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
  const deviceIdRef = useRef(null)

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    openDb().then(async db => {
      dbRef.current = db

      // Cache device_id for sync_log writes
      const [devRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")
      deviceIdRef.current = devRow?.value || null

      // GC orphaned lookup entries before first render — lookups are derived per device.
      // See shared/core/lookup.ts for rules (flow_meta keeps a flow name alive).
      try { await runLookupGc(createSqliteLookupAdapter(db)) } catch (e) { console.warn('[lookup gc] init failed', e) }

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
      planner.refreshPlannedTaskIds()

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
    setHistory(h => [...h.slice(-HISTORY_LIMIT), currentTasks])
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

  // ── Sub-hooks (must be before inline code that uses their state/setters) ──
  const pushHistory = useCallback((currentTasks) => {
    setHistory(h => [...h.slice(-HISTORY_LIMIT), currentTasks])
  }, [])

  const planner = usePlannerOps({ dbRef, deviceIdRef, pushHistory })
  const syncOps = useSyncOps({ dbRef, deviceIdRef, setTasks, setMetaSettings, refreshRef })

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
          await db.execute('UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id=?', [status, lts, did, id])
          changedIds.push(id)
          if (status === 'done') {
            await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [new Date().toISOString(), id])
            const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
            if (doneResult.spawned) {
              await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
            }
            activatedNames.push(...doneResult.activated.map(a => a.title))
          } else {
            await db.execute('UPDATE tasks SET completed_at=NULL WHERE id=?', [id])
          }
          await logChange(db, 'tasks', id, 'update', { status }, lts, did)
        }
      } else {
        const ph = [...ids].map(() => '?').join(',')
        await db.execute(`UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id IN (${ph})`, [status, lts, did, ...[...ids]])
        await db.execute(`UPDATE tasks SET completed_at=NULL WHERE id IN (${ph})`, [...ids])
        changedIds.push(...ids)
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
          const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
          if (doneResult.spawned) {
            await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
          }
          activatedNames.push(...doneResult.activated.map(a => a.title))
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
      // Clean up orphaned lookup entries (only count non-deleted tasks)
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
    const today = localIsoDate(new Date())
    for (const id of ids) {
      await db.execute("UPDATE tasks SET status='active', due=?, lamport_ts=?, device_id=? WHERE id=?", [today, lts, did, id])
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
      const ops = buildSqlOps(db, logChange)
      const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
      if (doneResult.spawned) {
        await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
      }
      activatedNames.push(...doneResult.activated.map(a => a.title))
    }
    // Sync notes: diff old vs new, soft-delete missing, upsert remaining.
    // Soft-delete (deleted_at) is required so sync can propagate deletions to other devices.
    if (changes.notes !== undefined) {
      const [taskRow] = await db.select('SELECT rtm_series_id FROM tasks WHERE id=?', [id])
      const seriesKey = taskRow?.rtm_series_id || id
      const existingNotes = await db.select(
        'SELECT id FROM notes WHERE task_series_id=? AND deleted_at IS NULL',
        [seriesKey]
      )
      const newNoteIds = new Set((changes.notes || []).map((n: any) => n.id))
      const deletedIds = existingNotes.filter((n: any) => !newNoteIds.has(n.id)).map((n: any) => n.id)
      const nowIso = new Date().toISOString()
      // Soft-delete removed notes
      for (const noteId of deletedIds) {
        await db.execute(
          'UPDATE notes SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?',
          [nowIso, nowIso, lts, did, noteId]
        )
        await logChange(db, 'notes', noteId, 'delete', { deletedAt: nowIso, taskSeriesId: seriesKey }, lts, did)
      }
      // Upsert remaining notes (INSERT OR REPLACE clears any prior deleted_at)
      for (const note of (changes.notes || [])) {
        const ts = note.createdAt ? new Date(note.createdAt).getTime() : Date.now()
        await db.execute(
          'INSERT OR REPLACE INTO notes (id, task_series_id, content, created_at, deleted_at, updated_at, lamport_ts, device_id) VALUES (?,?,?,?,NULL,?,?,?)',
          [note.id, seriesKey, note.content || '', ts, nowIso, lts, did]
        )
      }
    }
    await logChange(db, 'tasks', id, 'update', changes, lts, did)
    if (changes.notes !== undefined) {
      for (const note of (changes.notes || [])) {
        await logChange(db, 'notes', note.id, 'insert', { content: note.content, createdAt: note.createdAt }, lts, did)
      }
    }
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
    setHistory(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
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
        setTasks(prev)
        // Remove planner slots for deleted tasks from React state
        planner.setDayPlanSlots(s => s.filter(slot => !slot.taskId || prevIds.has(slot.taskId)))
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
    metaSettings, saveMeta,
    dbPath, revealDb, openNewDb, createNewDb, moveCurrentDb,
    createBackup, listBackups, restoreBackup,
    cleanupLookups,
    ...syncOps,
    openUrl: createSafeOpenUrl(openUrl),
    // Day Planner
    dayPlanSlots: planner.dayPlanSlots, currentPlan: planner.currentPlan, plannedTaskIds: planner.plannedTaskIds,
    plannerLoadDay: planner.plannerLoadDay, plannerRefreshSlots: planner.plannerRefreshSlots,
    plannerAddTaskSlot: planner.plannerAddTaskSlot, plannerAddBlockedSlot: planner.plannerAddBlockedSlot,
    plannerMoveSlot: planner.plannerMoveSlot, plannerResizeSlot: planner.plannerResizeSlot, plannerRemoveSlot: planner.plannerRemoveSlot,
    plannerUpdateSlotTitle: planner.plannerUpdateSlotTitle, plannerUpdateSlotRecurrence: planner.plannerUpdateSlotRecurrence, plannerUpdateHours: planner.plannerUpdateHours,
  }
}
