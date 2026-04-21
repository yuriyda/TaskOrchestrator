/**
 * @file helpers.ts
 * SQL helpers for task persistence: column definitions, row mapping, Lamport timestamps,
 * change logging, transaction wrapper, and fetch-all query.
 */
import { safeIsoDate } from '../core/date'
import { ulid } from '../ulid'
import { VALID_STATUSES, VALID_PRIORITIES } from '../core/constants'
import type { Task, TaskId, TaskStatus, TaskPriority, Note } from '../types'

/** Safe JSON.parse with fallback — protects against corrupted DB values. */
function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { console.warn('JSON parse error for:', raw.slice(0, 50)); return fallback }
}

/** Parse depends_on from DB: always returns string[] or null.
 *  Handles legacy string values, JSON arrays, and malformed data. */
export function parseDependsOn(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.length ? parsed : null
    if (typeof parsed === 'string' && parsed) return [parsed]
    return null
  } catch {
    // Raw non-JSON string (pre-migration v10 data)
    return [raw]
  }
}

// DB adapter type (Tauri SQL plugin)
interface DB {
  execute(sql: string, params?: any[]): Promise<any>
  select<T = any>(sql: string, params?: any[]): Promise<T[]>
}

// Canonical column list for INSERT INTO tasks — must match schema (v1–v7).
export const TASK_COLUMNS = [
  'id', 'title', 'status', 'priority', 'list_name', 'due', 'recurrence',
  'flow_id', 'depends_on', 'tags', 'created_at',
  'url', 'date_start', 'estimate', 'postponed', 'rtm_series_id',
  'personas', 'completed_at',
  'updated_at', 'deleted_at', 'device_id',
  'lamport_ts',
] as const

export const TASK_INSERT     = `INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`
export const TASK_INSERT_IGN = `INSERT OR IGNORE INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`

export function rowToTask(row: any, notesMap: Record<string, Note[]> = {}): Task {
  const status: TaskStatus = (VALID_STATUSES as readonly string[]).includes(row.status) ? row.status : 'inbox'
  const priority: TaskPriority = (VALID_PRIORITIES as readonly number[]).includes(Number(row.priority)) ? Number(row.priority) as TaskPriority : 4
  return {
    id:           row.id,
    title:        row.title || '(untitled)',
    status,
    priority,
    list:         row.list_name,
    due:          row.due,
    recurrence:   row.recurrence,
    flowId:       row.flow_id,
    dependsOn:    parseDependsOn(row.depends_on),
    tags:         safeJsonParse(row.tags, []),
    personas:     safeJsonParse(row.personas, []),
    createdAt:    row.created_at,
    subtasks:     [],
    url:          row.url          || null,
    dateStart:    row.date_start   || null,
    estimate:     row.estimate     || null,
    postponed:    row.postponed    || 0,
    rtmSeriesId:  row.rtm_series_id || null,
    completedAt:  row.completed_at || null,
    updatedAt:    row.updated_at   || null,
    deletedAt:    row.deleted_at   || null,
    deviceId:     row.device_id    || null,
    lamportTs:    row.lamport_ts   || 0,
    notes:        notesMap[row.rtm_series_id || row.id] || [],
  }
}

export function taskToRow(task: Partial<Task> & { id: string }): any[] {
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
    task.dependsOn?.length ? JSON.stringify(task.dependsOn) : null,
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
    task.lamportTs   || 0,
  ]
}

export async function nextLamport(db: DB, deviceId: string): Promise<number> {
  await db.execute(
    'INSERT OR IGNORE INTO vector_clock (device_id, counter) VALUES (?, 0)',
    [deviceId]
  )
  await db.execute(
    'UPDATE vector_clock SET counter = counter + 1 WHERE device_id = ?',
    [deviceId]
  )
  const [row] = await db.select<{ counter: number }>(
    'SELECT counter FROM vector_clock WHERE device_id = ?',
    [deviceId]
  )
  return row?.counter || 1
}

export async function logChange(
  db: DB, entity: string, entityId: string, action: string,
  data: any, lamportTs: number, deviceId: string,
): Promise<void> {
  await db.execute(
    'INSERT INTO sync_log (id, entity, entity_id, action, lamport_ts, device_id, data) VALUES (?,?,?,?,?,?,?)',
    [ulid(), entity, entityId, action, lamportTs, deviceId, data != null ? JSON.stringify(data) : null]
  )
}

export async function touchUpdatedAt(db: DB, ids: Set<TaskId> | TaskId[] | TaskId): Promise<void> {
  const now = new Date().toISOString()
  const idArr = ids instanceof Set ? [...ids] : (Array.isArray(ids) ? ids : [ids])
  if (idArr.length === 1) {
    await db.execute('UPDATE tasks SET updated_at=? WHERE id=?', [now, idArr[0]])
  } else if (idArr.length > 1) {
    const ph = idArr.map(() => '?').join(',')
    await db.execute(`UPDATE tasks SET updated_at=? WHERE id IN (${ph})`, [now, ...idArr])
  }
}

export function shiftDue(due: string | null): string | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due
  const d = new Date(due + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// NOTE: @tauri-apps/plugin-sql does not expose BEGIN/COMMIT/ROLLBACK,
// so real SQLite transactions are unavailable.  Each individual statement
// is atomic, but a crash mid-sequence may leave partial state.
// All call-sites that previously used withTransaction() now run their
// statements sequentially and include sync-log writes (logChange) in the
// same block to minimise the window for inconsistency.

import { measure } from '../../../shared/core/perfMeter.js'

export async function fetchAll(db: DB): Promise<Task[]> {
  return measure('fetchAll.sqlite', async () => {
    const [taskRows, noteRows] = await Promise.all([
      db.select('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY priority, created_at'),
      db.select('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY created_at'),
    ])
    const notesMap: Record<string, Note[]> = {}
    for (const n of noteRows as any[]) {
      if (!notesMap[n.task_series_id]) notesMap[n.task_series_id] = []
      notesMap[n.task_series_id].push({
        id:        n.id,
        content:   n.content,
        createdAt: new Date(n.created_at).toISOString(),
      })
    }
    return taskRows.map((row: any) => rowToTask(row, notesMap))
  })
}

export function buildSqlOps(db: DB, logChangeFn?: typeof logChange) {
  return {
    getTask: async (id: string) => {
      const [row] = await db.select('SELECT * FROM tasks WHERE id=?', [id])
      if (!row) return null
      // Use parseDependsOn (tolerant) instead of JSON.parse so mangled legacy
      // depends_on values don't crash handleTaskDone / isTaskBlocked.
      return { ...row, dependsOn: parseDependsOn(row.depends_on) }
    },
    insertTask: async (task: any) => {
      await db.execute(TASK_INSERT, taskToRow(task))
    },
    findInboxDependents: async (taskId: string) => {
      const rows: any[] = await db.select(
        `SELECT DISTINCT t.id, t.title, t.depends_on as dependsOnRaw FROM tasks t, json_each(t.depends_on) WHERE json_each.value = ? AND t.status = 'inbox' AND t.deleted_at IS NULL AND t.depends_on IS NOT NULL`,
        [taskId]
      )
      return rows.map(r => ({ id: r.id, title: r.title, dependsOn: r.dependsOnRaw ? JSON.parse(r.dependsOnRaw) : [] }))
    },
    isBlockerActive: async (taskId: string) => {
      const [dep] = await db.select(
        "SELECT id FROM tasks WHERE id = ? AND status != 'done' AND deleted_at IS NULL",
        [taskId]
      )
      return !!dep
    },
    activateTask: async (id: string, lts: number, did: string) => {
      const now = new Date().toISOString()
      await db.execute(
        "UPDATE tasks SET status = 'active', updated_at = ?, lamport_ts = ?, device_id = ? WHERE id = ?",
        [now, lts || 0, did || null, id]
      )
      if (lts && did && logChangeFn) {
        await logChangeFn(db, 'tasks', id, 'update', { status: 'active' }, lts, did)
      }
    },
  }
}
