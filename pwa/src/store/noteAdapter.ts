/**
 * @file noteAdapter.ts
 * @description IndexedDB-backed adapter for shared/core/saveNotes.ts.
 * Thin wrapper over the idb `db` handle; diff/dedup/normalization rules
 * live in the shared module so desktop and PWA can't drift.
 */
import type { NoteStorageAdapter, NoteRow } from '@shared/core/saveNotes'

function ulid(): string {
  const t = Date.now().toString(36).toUpperCase().padStart(10, '0')
  const r = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('').toUpperCase()
  return t + r
}

export function createIdbNoteAdapter(
  db: any,
  deviceId: string | null,
  nextLamport: (did: string | null) => Promise<number>,
): NoteStorageAdapter {
  return {
    async getSeriesId(taskId) {
      const t = await db.get('tasks', taskId)
      return t?.rtmSeriesId || taskId
    },
    async selectAliveNotes(seriesId) {
      const all = await db.getAllFromIndex('notes', 'taskSeriesId', seriesId)
      return all.filter((n: any) => !n.deletedAt) as NoteRow[]
    },
    async softDeleteNote(id, now, lts, did) {
      const n = await db.get('notes', id)
      if (!n) return
      n.deletedAt = now
      n.updatedAt = now
      n.lamportTs = lts
      n.deviceId = did
      await db.put('notes', n)
    },
    async upsertNote(note) {
      await db.put('notes', { ...note })
    },
    getDeviceId() { return deviceId },
    async nextLamport(did) { return nextLamport(did) },
    now() { return new Date().toISOString() },
    generateId() { return ulid() },
  }
}
