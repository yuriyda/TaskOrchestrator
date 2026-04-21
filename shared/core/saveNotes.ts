/**
 * @file saveNotes.ts
 * @description Shared diff-by-id save semantics for task notes, storage-agnostic.
 *
 * Parameterised by a NoteStorageAdapter — desktop (SQLite) and PWA (IDB) each
 * supply their own; the diff/soft-delete/upsert rules live here so the two
 * backends cannot drift. Note id is the stable sync key, so editing a note
 * preserves id; adding a new note gets a freshly-generated id; notes missing
 * from the incoming list are soft-deleted (tombstone propagates via sync).
 *
 * Contract for the caller (UI):
 *   saveNotes(adapter, taskId, [{ id?, content, createdAt? }, ...])
 * - content is trimmed; empty entries are dropped (treated as absent).
 * - id missing ⇒ new note, adapter.generateId() assigns a value.
 * - createdAt accepts number (epoch ms) OR ISO string; string is normalised.
 *
 * All writes in a single call share the same lamport_ts (one logical mutation).
 */

export interface NoteRow {
  id: string
  taskSeriesId: string
  content: string
  createdAt: number
  updatedAt?: string | null
  deletedAt?: string | null
  lamportTs: number
  deviceId: string | null
}

export interface IncomingNote {
  id?: string | null
  content: string
  createdAt?: number | string | null
}

export interface NoteStorageAdapter {
  getSeriesId(taskId: string): Promise<string>
  selectAliveNotes(seriesId: string): Promise<NoteRow[]>
  softDeleteNote(id: string, now: string, lts: number, did: string | null): Promise<void>
  upsertNote(note: NoteRow): Promise<void>
  getDeviceId(): string | null
  nextLamport(did: string | null): Promise<number>
  now(): string
  generateId(): string
  // Optional change-log hooks. Desktop uses them to feed its sync_log; PWA leaves
  // them unset (IDB has no separate delta log). Called AFTER the write lands.
  logDeleteNote?(noteId: string, seriesId: string, deletedAt: string, lts: number, did: string | null): Promise<void>
  logUpsertNote?(note: NoteRow): Promise<void>
}

function coerceCreatedAt(raw: number | string | null | undefined): number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const n = Date.parse(raw)
    if (!isNaN(n)) return n
  }
  return Date.now()
}

export async function saveNotes(
  adapter: NoteStorageAdapter,
  taskId: string,
  incomingNotes: IncomingNote[] | null | undefined,
): Promise<void> {
  const seriesId = await adapter.getSeriesId(taskId)
  const did = adapter.getDeviceId()
  const lts = await adapter.nextLamport(did)
  const nowIso = adapter.now()

  const normalized: NoteRow[] = (incomingNotes || [])
    .map(n => ({
      id: (n?.id as string) || '',
      content: (n?.content || '').trim(),
      rawCreatedAt: n?.createdAt ?? null,
    }))
    .filter(n => n.content.length > 0)
    .map(n => ({
      id: n.id || adapter.generateId(),
      taskSeriesId: seriesId,
      content: n.content,
      createdAt: coerceCreatedAt(n.rawCreatedAt),
      updatedAt: nowIso,
      deletedAt: null,
      lamportTs: lts,
      deviceId: did,
    }))

  const keepIds = new Set(normalized.map(n => n.id))

  const alive = await adapter.selectAliveNotes(seriesId)
  for (const row of alive) {
    if (keepIds.has(row.id)) continue
    await adapter.softDeleteNote(row.id, nowIso, lts, did)
    if (adapter.logDeleteNote) await adapter.logDeleteNote(row.id, seriesId, nowIso, lts, did)
  }

  // Dedup incoming by id — if the caller passes duplicates, keep only the
  // last occurrence (matches single-UPSERT-per-id semantics). Scan from the
  // end so "last" is seen first; splice earlier duplicates out.
  const seen = new Set<string>()
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (seen.has(normalized[i].id)) {
      normalized.splice(i, 1)
    } else {
      seen.add(normalized[i].id)
    }
  }

  for (const note of normalized) {
    await adapter.upsertNote(note)
    if (adapter.logUpsertNote) await adapter.logUpsertNote(note)
  }
}
