import { safeIsoDate } from '../core/date.js'
import { ulid } from '../ulid.js'
import { VALID_STATUSES, VALID_PRIORITIES } from '../core/constants.js'
import { nextDue } from '../core/recurrence.js'

// Canonical column list for INSERT INTO tasks — must match schema (v1–v6).
// Using explicit columns prevents breakage when new columns are added via migrations.
export const TASK_COLUMNS = [
  'id', 'title', 'status', 'priority', 'list_name', 'due', 'recurrence',
  'flow_id', 'depends_on', 'tags', 'created_at',
  'url', 'date_start', 'estimate', 'postponed', 'rtm_series_id',
  'personas', 'completed_at',
  'updated_at', 'deleted_at', 'device_id',
]
export const TASK_INSERT     = `INSERT INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`
export const TASK_INSERT_IGN = `INSERT OR IGNORE INTO tasks (${TASK_COLUMNS.join(', ')}) VALUES (${TASK_COLUMNS.map(() => '?').join(', ')})`

export function rowToTask(row, notesMap = {}) {
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

// Returns array of values matching INSERT column order (21 columns)
export function taskToRow(task) {
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
export async function touchUpdatedAt(db, ids) {
  const now = new Date().toISOString()
  const idArr = ids instanceof Set ? [...ids] : (Array.isArray(ids) ? ids : [ids])
  if (idArr.length === 1) {
    await db.execute('UPDATE tasks SET updated_at=? WHERE id=?', [now, idArr[0]])
  } else if (idArr.length > 1) {
    const ph = idArr.map(() => '?').join(',')
    await db.execute(`UPDATE tasks SET updated_at=? WHERE id IN (${ph})`, [now, ...idArr])
  }
}

export function shiftDue(due) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due
  const d = new Date(due + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Transaction wrapper — currently disabled (Tauri SQL plugin has issues with
// explicit BEGIN/COMMIT causing "database is locked" errors). All operations
// run in auto-commit mode. Re-enable when plugin transaction support is verified.
export async function withTransaction(db, fn) {
  return fn()
}

export async function fetchAll(db) {
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
      content:   n.content,
      createdAt: new Date(n.created_at).toISOString(),
    })
  }
  return taskRows.map(row => rowToTask(row, notesMap))
}

// Activate tasks that depend on the just-completed task and have all deps satisfied.
// Returns array of activated task titles (for toast).
export async function activateDependents(db, completedTaskId) {
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
export async function spawnNextOccurrence(db, taskId) {
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
