/**
 * @file syncActivityLog.ts
 * Sync Activity Log — diagnostic journal of local DB changes caused by incoming sync.
 * Records task inserts, updates, deletes with field-level diff and duplicate detection.
 *
 * Rules:
 * - Only call logSyncActivity from importSyncPackage (incoming sync only).
 * - Duplicate detection: strict title match against other tasks in DB.
 * - FIFO: keeps at most SYNC_ACTIVITY_LOG_LIMIT records.
 */
import { ulid } from '../ulid.js'

const SYNC_ACTIVITY_LOG_LIMIT = 500

export interface SyncActivityEntry {
  id: string
  timestamp: string
  taskId: string
  taskTitle: string
  action: 'insert' | 'update' | 'delete'
  changedFields: string | null
  deviceId: string | null
  isDuplicate: boolean
  incomingData: any | null
}

/**
 * Log a sync activity entry and trim old records beyond the limit.
 */
export async function logSyncActivity(
  db: any,
  taskId: string,
  taskTitle: string,
  action: 'insert' | 'update' | 'delete',
  changedFields: string[] | null,
  deviceId: string | null,
  incomingData: any = null,
): Promise<SyncActivityEntry> {
  // Duplicate detection: find another task with same title but different id
  let isDuplicate = false
  if (action === 'insert' || action === 'update') {
    const [dup] = await db.select(
      'SELECT id FROM tasks WHERE title = ? AND id != ? AND deleted_at IS NULL LIMIT 1',
      [taskTitle, taskId]
    )
    isDuplicate = !!dup
  }

  const entry: SyncActivityEntry = {
    id: ulid(),
    timestamp: new Date().toISOString(),
    taskId,
    taskTitle: taskTitle || '(untitled)',
    action,
    changedFields: changedFields?.length ? changedFields.join(', ') : null,
    deviceId,
    isDuplicate,
    incomingData,
  }

  // Ensure table + columns exist (defensive — covers fresh DB and mid-dev upgrades)
  await db.execute(
    `CREATE TABLE IF NOT EXISTS sync_activity_log (
       id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, task_id TEXT, task_title TEXT,
       action TEXT NOT NULL, changed_fields TEXT, device_id TEXT,
       is_duplicate INTEGER DEFAULT 0, incoming_data TEXT)`
  )
  try { await db.execute('ALTER TABLE sync_activity_log ADD COLUMN incoming_data TEXT') } catch {}

  await db.execute(
    'INSERT INTO sync_activity_log (id, timestamp, task_id, task_title, action, changed_fields, device_id, is_duplicate, incoming_data) VALUES (?,?,?,?,?,?,?,?,?)',
    [entry.id, entry.timestamp, entry.taskId, entry.taskTitle, entry.action, entry.changedFields, entry.deviceId, entry.isDuplicate ? 1 : 0, incomingData ? JSON.stringify(incomingData) : null]
  )

  // FIFO trim
  await db.execute(
    `DELETE FROM sync_activity_log WHERE id NOT IN (SELECT id FROM sync_activity_log ORDER BY timestamp DESC LIMIT ${SYNC_ACTIVITY_LOG_LIMIT})`
  )

  return entry
}

/**
 * Fetch recent sync activity entries for display.
 */
export async function getSyncActivityLog(db: any, limit = SYNC_ACTIVITY_LOG_LIMIT): Promise<SyncActivityEntry[]> {
  const rows = await db.select(
    'SELECT * FROM sync_activity_log ORDER BY timestamp DESC LIMIT ?',
    [limit]
  )
  return rows.map((r: any) => ({
    id: r.id,
    timestamp: r.timestamp,
    taskId: r.task_id,
    taskTitle: r.task_title,
    action: r.action,
    changedFields: r.changed_fields,
    deviceId: r.device_id,
    isDuplicate: !!r.is_duplicate,
    incomingData: r.incoming_data ? JSON.parse(r.incoming_data) : null,
  }))
}
