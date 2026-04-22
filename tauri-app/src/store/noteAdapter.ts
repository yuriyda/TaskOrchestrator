/**
 * @file noteAdapter.ts
 * @description SQLite-backed adapter for shared/core/saveNotes.ts.
 * Desktop additionally writes to the sync_log via logChange; that's routed
 * through the optional logDeleteNote / logUpsertNote hooks so the shared
 * helper stays backend-agnostic.
 */
import type { NoteStorageAdapter, NoteRow } from '@shared/core/saveNotes'
import { logChange, nextLamport as nextLamportHelper } from './helpers'
import { ulid } from '../ulid'

export function createSqliteNoteAdapter(db: any, deviceId: string | null): NoteStorageAdapter {
  return {
    async getSeriesId(taskId) {
      const [row] = await db.select('SELECT rtm_series_id FROM tasks WHERE id=?', [taskId])
      return row?.rtm_series_id || taskId
    },
    async selectAliveNotes(seriesId) {
      const rows = await db.select(
        'SELECT id, task_series_id, content, created_at, updated_at, deleted_at, lamport_ts, device_id FROM notes WHERE task_series_id=? AND deleted_at IS NULL',
        [seriesId],
      )
      return rows.map((r: any): NoteRow => ({
        id: r.id,
        taskSeriesId: r.task_series_id,
        content: r.content || '',
        createdAt: Number(r.created_at) || 0,
        updatedAt: r.updated_at || null,
        deletedAt: r.deleted_at || null,
        lamportTs: Number(r.lamport_ts) || 0,
        deviceId: r.device_id || null,
      }))
    },
    async softDeleteNote(id, now, lts, did) {
      await db.execute(
        'UPDATE notes SET deleted_at=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?',
        [now, now, lts, did, id],
      )
    },
    async upsertNote(note) {
      await db.execute(
        'INSERT OR REPLACE INTO notes (id, task_series_id, content, created_at, deleted_at, updated_at, lamport_ts, device_id) VALUES (?,?,?,?,NULL,?,?,?)',
        [note.id, note.taskSeriesId, note.content || '', note.createdAt, note.updatedAt || null, note.lamportTs, note.deviceId],
      )
    },
    getDeviceId() { return deviceId },
    async nextLamport(did) { return nextLamportHelper(db, did) },
    now() { return new Date().toISOString() },
    generateId() { return ulid() },
    async logDeleteNote(noteId, seriesId, deletedAt, lts, did) {
      await logChange(db, 'notes', noteId, 'delete', { deletedAt, taskSeriesId: seriesId }, lts, did)
    },
    async logUpsertNote(note) {
      await logChange(db, 'notes', note.id, 'insert', { content: note.content, createdAt: note.createdAt }, note.lamportTs, note.deviceId)
    },
  }
}
