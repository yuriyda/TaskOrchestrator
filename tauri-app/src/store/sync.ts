/**
 * Decentralized sync engine — state-based, not log-based.
 *
 * Core idea: each device can compute a delta for any other device by comparing
 * its current DB state against the other device's vector clock. No sync_log
 * dependency for transport — sync_log is only a local UI convenience.
 *
 * tasks.device_id tracks who last modified each task.
 * tasks.lamport_ts tracks when (in that device's logical time).
 * vector_clock tracks what each device knows about every other device.
 *
 * Full export = computeSyncPackage(db, {})  — empty target VC = send everything.
 * Delta export = computeSyncPackage(db, remoteVC) — only what remote hasn't seen.
 *
 * Editing rules:
 * - All functions receive a db adapter (execute/select) — no direct SQLite import.
 * - Must stay transport-agnostic (no Google Drive / filesystem logic here).
 */

import { TASK_INSERT_IGN, taskToRow, rowToTask, fetchAll } from './helpers.js'
import { logSyncActivity } from './syncActivityLog.js'
import type { Task } from '../types'

// ─── Types ─────────────────────────────────────────────────────────────────

interface VectorClock {
  [deviceId: string]: number
}

interface SyncRequest {
  type: 'sync_request'
  deviceId: string | null
  vectorClock: VectorClock
}

interface SyncNote {
  id: string
  taskSeriesId: string
  content: string
  createdAt: string
}

interface FlowMetaEntry {
  name: string
  description: string
  color: string
  deadline: string | null
}

interface SyncPackage {
  type: 'sync_package'
  deviceId: string | null
  vectorClock: VectorClock
  tasks: Task[]
  notes: SyncNote[]
  lists: string[]
  tags: string[]
  flows: string[]
  personas: string[]
  flowMeta: FlowMetaEntry[]
}

interface SyncDelta {
  id: string
  entity: string
  entityId: string
  action: string
  lamportTs: number
  deviceId: string
  data: any
}

interface ExportDeltasResult {
  deviceId: string | null
  vectorClock: VectorClock
  deltas: SyncDelta[]
}

interface ImportSyncResult {
  stats: { applied: number; skipped: number; outdated: number }
  response: SyncPackage
}

// ─── Sync request (Phase 1) ─────────────────────────────────────────────────

/**
 * Build a sync request — a lightweight message that tells the responder
 * who we are and what we already know (our vector clock).
 * The responder uses this to compute a delta package for us.
 */
export async function buildSyncRequest(db: any): Promise<SyncRequest> {
  const [devRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")
  const localDeviceId = devRow?.value || null
  const vcRows = await db.select('SELECT device_id, counter FROM vector_clock')
  const localVC: VectorClock = Object.fromEntries(vcRows.map((r: any) => [r.device_id, r.counter]))

  return {
    type: 'sync_request',
    deviceId: localDeviceId,
    vectorClock: localVC,
  }
}

// ─── Compute sync package from live DB ──────────────────────────────────────

/**
 * Build a sync package containing everything the target device hasn't seen.
 * targetVC: the remote device's vector clock, e.g. { DEVICE_A: 10, DEVICE_B: 5 }
 * Empty targetVC = full export (recovery mode).
 */
export async function computeSyncPackage(db: any, targetVC: VectorClock = {}): Promise<SyncPackage> {
  const [devRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")
  const localDeviceId = devRow?.value || null
  const vcRows = await db.select('SELECT device_id, counter FROM vector_clock')
  const localVC: VectorClock = Object.fromEntries(vcRows.map((r: any) => [r.device_id, r.counter]))

  // Find tasks the target hasn't seen:
  // A task is "unseen" if its device_id (last modifier) has a lamport_ts
  // higher than what the target knows for that device.
  const allTasks = await db.select('SELECT * FROM tasks')
  const tasksToSend = allTasks.filter((t: any) => {
    if (!t.device_id) return true // unknown origin — always send
    const targetKnows = targetVC[t.device_id] || 0
    return t.lamport_ts > targetKnows
  })

  // Notes for those tasks
  const taskIds = new Set(tasksToSend.map((t: any) => t.id))
  const seriesIds = new Set(tasksToSend.map((t: any) => t.rtm_series_id || t.id))
  const allNotes = await db.select('SELECT * FROM notes')
  const notesToSend = allNotes.filter((n: any) => seriesIds.has(n.task_series_id))

  // Always include all lookup tables (small, idempotent)
  const lists = (await db.select('SELECT name FROM lists')).map((r: any) => r.name)
  const tags = (await db.select('SELECT name FROM tags')).map((r: any) => r.name)
  const flows = (await db.select('SELECT name FROM flows')).map((r: any) => r.name)
  const personas = (await db.select('SELECT name FROM personas')).map((r: any) => r.name)
  const flowMeta = await db.select('SELECT * FROM flow_meta')

  return {
    type: 'sync_package',
    deviceId: localDeviceId,
    vectorClock: localVC,
    tasks: tasksToSend.map((row: any) => rowToTask(row)),
    notes: notesToSend.map((n: any) => ({
      id: n.id, taskSeriesId: n.task_series_id,
      content: n.content, createdAt: n.created_at,
    })),
    lists, tags, flows, personas,
    flowMeta: flowMeta.map((r: any) => ({
      name: r.name, description: r.description || '',
      color: r.color || '', deadline: r.deadline || null,
    })),
  }
}

// ─── Import sync package ────────────────────────────────────────────────────

/**
 * Apply an incoming sync package and compute a response for the sender.
 * Returns { stats: { applied, skipped, outdated }, response: <package for sender> }
 */
export async function importSyncPackage(db: any, pkg: SyncPackage): Promise<ImportSyncResult> {
  const { deviceId: remoteDeviceId, vectorClock: remoteVC, tasks, notes, lists, tags, flows, personas, flowMeta } = pkg

  let applied = 0
  let skipped = 0
  let outdated = 0

  // Update vector_clock with remote device's counters
  if (remoteVC) {
    for (const [devId, counter] of Object.entries(remoteVC)) {
      await db.execute(
        'INSERT INTO vector_clock (device_id, counter) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET counter = MAX(counter, excluded.counter)',
        [devId, counter]
      )
    }
  }

  // Apply tasks
  if (tasks) {
    const [localDevRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")
    const localDeviceId = localDevRow?.value || null
    let maxImportedLts = 0

    for (const task of tasks) {
      const [existing] = await db.select('SELECT lamport_ts, device_id FROM tasks WHERE id = ?', [task.id])
      maxImportedLts = Math.max(maxImportedLts, task.lamportTs || 0)

      if (!existing) {
        // New task — insert (even if from same device — could be restore/recovery)
        try {
          await db.execute(TASK_INSERT_IGN, taskToRow(task))
          applied++
          console.log(`[sync] INSERT ${task.id?.slice(0,8)} "${task.title?.slice(0,20)}" lts=${task.lamportTs} did=${task.deviceId?.slice(0,8)}`)
        } catch { skipped++; continue }
        try { await logSyncActivity(db, task.id, task.title, 'insert', null, task.deviceId, task) } catch (e) { console.warn('[sync] activity log error:', e) }
      } else if (task.deviceId === localDeviceId) {
        // Our own task bounced back — skip update
        skipped++
      } else if ((task.lamportTs || 0) > (existing.lamport_ts || 0)) {
        // Incoming is newer — full update
        const changedFields = await detectChangedFields(db, task)
        await fullUpdateTask(db, task)
        applied++
        console.log(`[sync] UPDATE ${task.id?.slice(0,8)} "${task.title?.slice(0,20)}" remote_lts=${task.lamportTs} > local_lts=${existing.lamport_ts} did=${task.deviceId?.slice(0,8)}`)
        try { await logSyncActivity(db, task.id, task.title, task.deletedAt ? 'delete' : 'update', changedFields, task.deviceId, task) } catch (e) { console.warn('[sync] activity log error:', e) }
      } else if ((task.lamportTs || 0) === (existing.lamport_ts || 0)) {
        // Same version — already applied, skip
        skipped++
      } else {
        // Incoming is older — local wins, skip outdated
        outdated++
        console.log(`[sync] OUTDATED ${task.id?.slice(0,8)} "${task.title?.slice(0,20)}" remote_lts=${task.lamportTs} < local_lts=${existing.lamport_ts}`)
      }
    }

    // Lamport clock merge rule: ensure local counter >= max imported timestamp.
    // Without this, a device with a low counter could modify an imported task
    // and assign a lamportTs lower than the task's current value, causing
    // the modification to be rejected as "older" on the next sync.
    if (localDeviceId && maxImportedLts > 0) {
      await db.execute(
        'INSERT INTO vector_clock (device_id, counter) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET counter = MAX(counter, ?)',
        [localDeviceId, maxImportedLts, maxImportedLts]
      )
    }
  }

  // Apply lookup tables (idempotent)
  if (lists) for (const name of lists) await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [name])
  if (tags) for (const name of tags) await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [name])
  if (flows) for (const name of flows) await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [name])
  if (personas) for (const name of personas) await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [name])

  // Apply flow_meta (upsert)
  if (flowMeta) {
    for (const fm of flowMeta) {
      await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [fm.name])
      const [existing] = await db.select('SELECT * FROM flow_meta WHERE name = ?', [fm.name])
      if (existing) {
        await db.execute('UPDATE flow_meta SET description=?, color=?, deadline=? WHERE name=?',
          [fm.description || '', fm.color || '', fm.deadline || null, fm.name])
      } else {
        await db.execute('INSERT INTO flow_meta (name, description, color, deadline) VALUES (?,?,?,?)',
          [fm.name, fm.description || '', fm.color || '', fm.deadline || null])
      }
    }
  }

  // Apply notes (for received tasks)
  if (notes) {
    for (const note of notes) {
      await db.execute(
        'INSERT OR REPLACE INTO notes (id, task_series_id, content, created_at) VALUES (?,?,?,?)',
        [note.id, note.taskSeriesId || '', note.content || '', note.createdAt || Date.now()]
      )
    }
  }

  // Compute response: what does the sender need from us?
  const response = await computeSyncPackage(db, remoteVC || {})

  return {
    stats: { applied, skipped, outdated },
    response,
  }
}

/** Field mapping: [label, taskKey, dbColumn, default] */
const DIFF_FIELDS: [string, string, string, any][] = [
  ['title',        'title',       'title',        ''],
  ['status',       'status',      'status',       'inbox'],
  ['priority',     'priority',    'priority',     4],
  ['list',         'list',        'list_name',    null],
  ['due',          'due',         'due',          null],
  ['deleted_at',   'deletedAt',   'deleted_at',   null],
  ['completed_at', 'completedAt', 'completed_at', null],
  ['recurrence',   'recurrence',  'recurrence',   null],
  ['estimate',     'estimate',    'estimate',     null],
  ['flowId',       'flowId',      'flow_id',      null],
]

/** Detect which user-facing fields differ between incoming task and local DB row. */
async function detectChangedFields(db: any, task: Partial<Task>): Promise<string[]> {
  const [row] = await db.select('SELECT * FROM tasks WHERE id = ?', [task.id])
  if (!row) return []
  return DIFF_FIELDS
    .filter(([, taskKey, dbCol, def]) => (task[taskKey] ?? def) !== (row[dbCol] ?? def))
    .map(([label]) => label)
}

/**
 * Full update of a task from incoming data (all fields).
 */
async function fullUpdateTask(db: any, task: Partial<Task>): Promise<void> {
  const sets = [
    'title=?', 'status=?', 'priority=?', 'list_name=?', 'due=?',
    'recurrence=?', 'flow_id=?', 'depends_on=?', 'tags=?', 'personas=?',
    'url=?', 'date_start=?', 'estimate=?', 'postponed=?',
    'completed_at=?', 'updated_at=?', 'deleted_at=?', 'lamport_ts=?', 'device_id=?',
  ]
  const vals: any[] = [
    task.title || '', task.status || 'inbox', task.priority || 4,
    task.list || null, task.due || null,
    task.recurrence || null, task.flowId || null, task.dependsOn?.length ? JSON.stringify(task.dependsOn) : null,
    JSON.stringify(task.tags || []), JSON.stringify(task.personas || []),
    task.url || null, task.dateStart || null, task.estimate || null, task.postponed || 0,
    task.completedAt || null, task.updatedAt || new Date().toISOString(),
    task.deletedAt || null, task.lamportTs || 0, task.deviceId || null,
  ]
  vals.push(task.id)
  await db.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, vals)

  // Update lookup tables
  if (task.list) await db.execute('INSERT OR IGNORE INTO lists VALUES (?)', [task.list])
  if (task.tags) for (const t of task.tags) await db.execute('INSERT OR IGNORE INTO tags VALUES (?)', [t])
  if (task.personas) for (const p of task.personas) await db.execute('INSERT OR IGNORE INTO personas VALUES (?)', [p])
  if (task.flowId) await db.execute('INSERT OR IGNORE INTO flows VALUES (?)', [task.flowId])
}

// ─── Legacy sync_log functions (kept for local UI) ──────────────────────────

/**
 * Collect sync_log entries (for the delta log viewer in Settings).
 */
export async function exportDeltas(db: any, sinceTs: number = 0): Promise<ExportDeltasResult> {
  const deltas = await db.select(
    'SELECT * FROM sync_log WHERE lamport_ts > ? ORDER BY lamport_ts',
    [sinceTs]
  )
  const vectorClock = await db.select('SELECT device_id, counter FROM vector_clock')
  const [devRow] = await db.select("SELECT value FROM meta WHERE key='device_id'")

  return {
    deviceId: devRow?.value || null,
    vectorClock: Object.fromEntries(vectorClock.map((r: any) => [r.device_id, r.counter])),
    deltas: deltas.map((d: any) => ({
      id:        d.id,
      entity:    d.entity,
      entityId:  d.entity_id,
      action:    d.action,
      lamportTs: d.lamport_ts,
      deviceId:  d.device_id,
      data:      d.data ? JSON.parse(d.data) : null,
    })),
  }
}

export async function clearSyncLog(db: any, upToLamportTs: number): Promise<void> {
  await db.execute('DELETE FROM sync_log WHERE lamport_ts <= ?', [upToLamportTs])
}

export async function getVectorClock(db: any): Promise<VectorClock> {
  const rows = await db.select('SELECT device_id, counter FROM vector_clock')
  return Object.fromEntries(rows.map((r: any) => [r.device_id, r.counter]))
}

export function filterNewDeltas(deltas: SyncDelta[], localVC: VectorClock): SyncDelta[] {
  return deltas.filter(d => {
    const knownCounter = localVC[d.deviceId] || 0
    return d.lamportTs > knownCounter
  })
}
