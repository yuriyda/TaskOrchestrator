/**
 * SQLite-backed task store (React hook) — the primary persistence layer for Tauri desktop app.
 * Manages DB lifecycle, task CRUD, bulk operations, undo, import/export, flow metadata, and backups.
 * Conforms to the StoreApi contract defined in store/storeApi.js and types.ts.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import Database from '@tauri-apps/plugin-sql'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { copyFile, remove, exists, readDir } from '@tauri-apps/plugin-fs'
import { revealItemInDir, openUrl } from '@tauri-apps/plugin-opener'
import { ulid } from './ulid.js'
import { safeIsoDate, localDateStr } from './core/date.js'
import { VALID_STATUSES, VALID_PRIORITIES } from './core/constants.js'
import { handleTaskDone, isTaskBlocked, computeNextCycleStatus } from './core/taskActions.js'
import { MIGRATIONS_V1, MIGRATIONS_V2, MIGRATIONS_V3, MIGRATIONS_V4, MIGRATIONS_V5, MIGRATIONS_V6, MIGRATIONS_V7, LATEST_SCHEMA_VERSION } from './store/migrations.js'
import { TASK_COLUMNS, TASK_INSERT, TASK_INSERT_IGN, rowToTask, taskToRow, touchUpdatedAt, shiftDue, withTransaction, fetchAll, buildSqlOps, logChange, nextLamport } from './store/helpers.js'
import { DB_PATH_KEY, MAX_BACKUPS, resolveDbPath, backupBeforeMigration } from './store/backup.js'
import { createSafeOpenUrl } from './store/storeApi.js'
import { exportDeltas, clearSyncLog, getVectorClock, buildSyncRequest, computeSyncPackage, importSyncPackage } from './store/sync.js'
import { isConnected as gdriveIsConnected, connect as gdriveConnect, disconnect as gdriveDisconnect, syncWithDrive, hasSyncFile as gdriveHasSyncFile, deleteSyncFile as gdriveDeleteSyncFile, readSyncFile as gdriveReadSyncFile, loadTokens as gdriveLoadTokens } from './store/googleDrive.js'

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
      const genId = ulid
      await _db.execute("INSERT OR REPLACE INTO meta VALUES ('device_id', ?)", [genId()])
    }
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','6')")
  }
  if (version < 7) {
    for (const sql of MIGRATIONS_V7) {
      try { await _db.execute(sql) } catch (_) { /* column/table already exists */ }
    }
    // Initialize vector_clock for this device
    const [devRow] = await _db.select("SELECT value FROM meta WHERE key='device_id'")
    if (devRow) {
      await _db.execute('INSERT OR IGNORE INTO vector_clock (device_id, counter) VALUES (?, 0)', [devRow.value])
    }
    // Backfill lamport_ts from rowid order for existing tasks
    try { await _db.execute("UPDATE tasks SET lamport_ts = rowid WHERE lamport_ts = 0") } catch (_) {}
    await _db.execute("INSERT OR REPLACE INTO meta VALUES ('schema_version','7')")
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
    setHistory(h => [...h.slice(-5), currentTasks])
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
    await withTransaction(db, async () => {
      await db.execute(TASK_INSERT, taskToRow(task))
      if (task.list)   await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
      for (const t of task.tags)     await db.execute('INSERT OR IGNORE INTO tags     VALUES (?)', [t])
      for (const p of task.personas) await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
      if (task.flowId) await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [task.flowId])
    })
    await logChange(db, 'tasks', task.id, 'insert', task, lts, did)
    if (task.list)   await logChange(db, 'lists', task.list, 'insert', { name: task.list }, lts, did)
    for (const t of task.tags)     await logChange(db, 'tags', t, 'insert', { name: t }, lts, did)
    for (const p of task.personas) await logChange(db, 'personas', p, 'insert', { name: p }, lts, did)
    if (task.flowId) await logChange(db, 'flows', task.flowId, 'insert', { name: task.flowId }, lts, did)
    refreshRef()
  }), [mutate, refreshRef])

  const bulkStatus = useCallback((ids, status, cur) => {
    let activatedNames = []
    let skippedBlocked = 0
    const promise = mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const ops = buildSqlOps(db, logChange)

      const changedIds = []
      await withTransaction(db, async () => {
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
          }
        } else {
          const ph = [...ids].map(() => '?').join(',')
          await db.execute(`UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id IN (${ph})`, [status, lts, did, ...[...ids]])
          await db.execute(`UPDATE tasks SET completed_at=NULL WHERE id IN (${ph})`, [...ids])
          changedIds.push(...ids)
        }
        await touchUpdatedAt(db, ids)
      })
      for (const id of changedIds) {
        await logChange(db, 'tasks', id, 'update', { status }, lts, did)
      }
    })
    return promise.then(() => ({ activated: activatedNames, skippedBlocked }))
  }, [mutate])

  const bulkCycle = useCallback((ids, cur) => {
    let activatedNames = []
    const promise = mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const ops = buildSqlOps(db, logChange)
      const changes = []
      await withTransaction(db, async () => {
        for (const id of ids) {
          const [row] = await db.select('SELECT status, depends_on FROM tasks WHERE id=?', [id])
          if (!row) continue
          const blocked = await isTaskBlocked(ops, id)
          const next = computeNextCycleStatus(row.status, blocked)
          await db.execute('UPDATE tasks SET status=?, lamport_ts=?, device_id=? WHERE id=?', [next, lts, did, id])
          await db.execute('UPDATE tasks SET completed_at=? WHERE id=?', [next === 'done' ? new Date().toISOString() : null, id])
          changes.push({ id, status: next })
          if (next === 'done') {
            const doneResult = await handleTaskDone(ops, id, ulid, lts, did)
            if (doneResult.spawned) {
              await logChange(db, 'tasks', doneResult.spawned.id, 'insert', doneResult.spawned, lts, did)
            }
            activatedNames.push(...doneResult.activated.map(a => a.title))
          }
        }
        await touchUpdatedAt(db, ids)
      })
      for (const c of changes) {
        await logChange(db, 'tasks', c.id, 'update', { status: c.status }, lts, did)
      }
    })
    return promise.then(() => ({ activated: activatedNames }))
  }, [mutate])

  const bulkDelete = useCallback(async (ids, cur) => {
    const idArr = [...ids]
    const ph    = idArr.map(() => '?').join(',')
    await mutate(cur, async db => {
      const did = deviceIdRef.current
      const lts = await nextLamport(db, did)
      const now = new Date().toISOString()
      await withTransaction(db, async () => {
        // Soft-delete: set deleted_at instead of removing rows (for sync propagation)
        await db.execute(
          `UPDATE tasks SET deleted_at=?, lamport_ts=?, device_id=?, updated_at=? WHERE id IN (${ph})`,
          [now, lts, did, now, ...idArr]
        )
        // Clean up orphaned lookup entries (only count non-deleted tasks)
        await db.execute(`DELETE FROM lists    WHERE name NOT IN (SELECT DISTINCT list_name FROM tasks WHERE list_name IS NOT NULL AND deleted_at IS NULL)`)
        await db.execute(`DELETE FROM flows    WHERE name NOT IN (SELECT DISTINCT flow_id FROM tasks WHERE flow_id IS NOT NULL AND deleted_at IS NULL) AND name NOT IN (SELECT name FROM flow_meta)`)
        await db.execute(`DELETE FROM tags     WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.tags) WHERE tasks.deleted_at IS NULL)`)
        await db.execute(`DELETE FROM personas WHERE name NOT IN (SELECT DISTINCT value FROM tasks, json_each(tasks.personas) WHERE tasks.deleted_at IS NULL)`)
      })
      for (const id of idArr) {
        await logChange(db, 'tasks', id, 'delete', null, lts, did)
      }
    })
    await refreshRef()
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
        await db.execute('UPDATE tasks SET due=?, postponed=COALESCE(postponed,0)+1, lamport_ts=?, device_id=? WHERE id=?', [newDue, lts, did, id])
        await logChange(db, 'tasks', id, 'update', { due: newDue }, lts, did)
      }
      await touchUpdatedAt(db, ids)
    })
  }), [mutate])

  const bulkAssignToday = useCallback((ids, cur) => mutate(cur, async db => {
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
    const today = new Date().toISOString().slice(0, 10)
    await withTransaction(db, async () => {
      for (const id of ids) {
        await db.execute("UPDATE tasks SET status='active', due=?, lamport_ts=?, device_id=? WHERE id=?", [today, lts, did, id])
        await logChange(db, 'tasks', id, 'update', { status: 'active', due: today }, lts, did)
      }
      await touchUpdatedAt(db, ids)
    })
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
    const DATE_COLS = new Set(['due', 'dateStart'])
    for (const [key, val] of Object.entries(changes)) {
      const col = COL[key]
      if (!col) continue
      setClauses.push(`${col} = ?`)
      const v = DATE_COLS.has(key) ? safeIsoDate(val) : (JSON_COLS.has(key) ? JSON.stringify(val ?? []) : (val ?? null))
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
    // Sync notes: use rtm_series_id if present, otherwise task id
    if (changes.notes !== undefined) {
      const [taskRow] = await db.select('SELECT rtm_series_id FROM tasks WHERE id=?', [id])
      const seriesKey = taskRow?.rtm_series_id || id
      await db.execute('DELETE FROM notes WHERE task_series_id=?', [seriesKey])
      for (const note of changes.notes) {
        const ts = note.createdAt ? new Date(note.createdAt).getTime() : Date.now()
        await db.execute(
          'INSERT INTO notes (id, task_series_id, content, created_at) VALUES (?,?,?,?)',
          [note.id, seriesKey, note.content || '', ts]
        )
      }
    }
    await logChange(db, 'tasks', id, 'update', changes, lts, did)
    if (changes.notes !== undefined) {
      for (const note of (changes.notes || [])) {
        await logChange(db, 'notes', note.id, 'insert', { content: note.content, createdAt: note.createdAt }, lts, did)
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
    const did = deviceIdRef.current
    const lts = await nextLamport(db, did)
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
    const did = deviceIdRef.current
    const { tasks: demoTasks, lists: demoLists, tags: demoTags, flows: demoFlows, personas: demoPersonas } = data

    await withTransaction(db, async () => {
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
    })

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
    await withTransaction(db, async () => {
      await db.execute('DELETE FROM tasks')
      await db.execute('DELETE FROM notes')
      await db.execute('DELETE FROM tags')
      await db.execute('DELETE FROM lists')
      await db.execute('DELETE FROM flows')
      await db.execute('DELETE FROM flow_meta')
      await db.execute('DELETE FROM personas')
      // sync_log and vector_clock are NOT cleared — clearAll is a local operation.
      // Sync data survives so that next sync can restore tasks from cloud.
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

  const createNewDb = useCallback(async () => {
    const selected = await saveFileDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: 'tasks.db',
    })
    if (!selected) return false
    await _closeDb()
    _reinit(selected)
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

  // ── Sync: export/import deltas to/from file ────────────────────────────────

  const getSyncLog = useCallback(async () => {
    const db = dbRef.current
    if (!db) return []
    const rows = await db.select('SELECT * FROM sync_log ORDER BY lamport_ts DESC')
    return rows.map(r => ({
      id: r.id, entity: r.entity, entityId: r.entity_id,
      action: r.action, lamportTs: r.lamport_ts,
      deviceId: r.device_id, data: r.data ? JSON.parse(r.data) : null,
    }))
  }, [])

  const getSyncStats = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const [countRow] = await db.select('SELECT COUNT(*) as count FROM sync_log')
    const [lastRow] = await db.select("SELECT value FROM meta WHERE key='last_sync_lamport'")
    const vc = await getVectorClock(db)
    const did = deviceIdRef.current
    const pendingCount = lastRow?.value
      ? (await db.select('SELECT COUNT(*) as count FROM sync_log WHERE lamport_ts > ?', [parseInt(lastRow.value)]))[0].count
      : countRow.count
    const [lastSyncRow] = await db.select("SELECT value FROM meta WHERE key='last_sync'")
    return {
      totalEntries: countRow.count,
      pendingCount,
      lastSyncTs: lastRow?.value ? parseInt(lastRow.value) : null,
      lastSync: lastSyncRow?.value || null,
      vectorClock: vc,
      deviceId: did,
    }
  }, [])

  const clearSyncData = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await db.execute('DELETE FROM sync_log')
    await db.execute("DELETE FROM meta WHERE key='last_sync_lamport'")
  }, [])

  const exportSync = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null

    // Read last sync timestamp
    const [lastRow] = await db.select("SELECT value FROM meta WHERE key='last_sync_lamport'")
    const sinceTs = parseInt(lastRow?.value || '0')

    const pkg = await exportDeltas(db, sinceTs)
    if (pkg.deltas.length === 0) return { count: 0 }

    const json = JSON.stringify(pkg, null, 2)

    // Save via File System Access API
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `sync-${pkg.deviceId || 'export'}.json`,
          types: [{ description: 'Sync Package', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()

        // Remember last exported lamport_ts
        const maxTs = Math.max(...pkg.deltas.map(d => d.lamportTs))
        await db.execute("INSERT OR REPLACE INTO meta VALUES ('last_sync_lamport', ?)", [String(maxTs)])

        return { count: pkg.deltas.length }
      } catch (e) {
        if (e.name === 'AbortError') return null // user cancelled
        throw e
      }
    }

    // Fallback: anchor download
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sync-${pkg.deviceId || 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)

    const maxTs = Math.max(...pkg.deltas.map(d => d.lamportTs))
    await db.execute("INSERT OR REPLACE INTO meta VALUES ('last_sync_lamport', ?)", [String(maxTs)])

    return { count: pkg.deltas.length }
  }, [])

  // Phase 1: copy sync request (our VC) to clipboard
  const exportSyncRequest = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const req = await buildSyncRequest(db)
    await navigator.clipboard.writeText(JSON.stringify(req))
    return req
  }, [])

  // Phase 2: responder received a sync_request → compute package for requester
  const handleSyncRequest = useCallback(async (req) => {
    const db = dbRef.current
    if (!db || !req || req.type !== 'sync_request') return null
    const pkg = await computeSyncPackage(db, req.vectorClock || {})
    await navigator.clipboard.writeText(JSON.stringify(pkg))
    return { count: pkg.tasks.length, notesCount: pkg.notes.length }
  }, [])

  // Phase 3-4: apply a sync_package and auto-copy response
  const importSyncClipboard = useCallback(async (pkg) => {
    const db = dbRef.current
    if (!db || !pkg || pkg.type !== 'sync_package') return null

    const { stats, response } = await importSyncPackage(db, pkg)

    // Auto-copy response to clipboard (what sender needs from us)
    if (response.tasks.length > 0 || response.notes.length > 0) {
      await navigator.clipboard.writeText(JSON.stringify(response))
    }

    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", ['last_sync', new Date().toISOString()])
    setTasks(await fetchAll(db))
    await refreshRef()

    return { ...stats, responseCount: response.tasks.length }
  }, [refreshRef])

  // ── Google Drive sync ───────────────────────────────────────────────────────

  const gdriveCheckConnection = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveIsConnected(db)
  }, [])

  const gdriveConnectAccount = useCallback(async (clientId, clientSecret) => {
    const db = dbRef.current
    if (!db) return false
    return gdriveConnect(db, clientId, clientSecret)
  }, [])

  const gdriveDisconnectAccount = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await gdriveDisconnect(db)
  }, [])

  const gdriveSyncNow = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const result = await syncWithDrive(db, computeSyncPackage, importSyncPackage)
    const isoNow = new Date().toISOString()
    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", ['last_sync', isoNow])
    setMetaSettings(prev => ({ ...prev, last_sync: isoNow }))
    setTasks(await fetchAll(db))
    await refreshRef()
    return result
  }, [refreshRef])

  const gdriveGetConfig = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const tokens = await gdriveLoadTokens(db)
    return { clientId: tokens.client_id, hasToken: !!tokens.access_token }
  }, [])

  const gdriveCheckSyncFile = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveHasSyncFile(db)
  }, [])

  const gdrivePurgeSyncFile = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveDeleteSyncFile(db)
  }, [])

  const gdriveReadSyncFileCb = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    return gdriveReadSyncFile(db)
  }, [])

  const importSync = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null

    // Open file picker
    const selected = await openFileDialog({
      filters: [{ name: 'Sync Package', extensions: ['json'] }],
      multiple: false,
    })
    if (!selected) return null

    const filePath = typeof selected === 'string' ? selected : selected[0]

    // Read file via fetch (works for Tauri asset protocol paths)
    let pkg
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const text = await readTextFile(filePath)
      pkg = JSON.parse(text)
    } catch (e) {
      console.error('Failed to read sync file:', e)
      return null
    }

    const result = await importDeltas(db, pkg)

    // Refresh state
    setTasks(await fetchAll(db))
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
    exportSync, importSync, exportSyncRequest, handleSyncRequest, importSyncClipboard, getSyncLog, getSyncStats, clearSyncData,
    gdriveCheckConnection, gdriveConnectAccount, gdriveDisconnectAccount, gdriveSyncNow, gdriveGetConfig, gdriveCheckSyncFile, gdrivePurgeSyncFile, gdriveReadSyncFile: gdriveReadSyncFileCb,
    openUrl: createSafeOpenUrl(openUrl),
  }
}
