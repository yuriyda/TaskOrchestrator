/**
 * Compliance tests for shared/core/saveNotes.ts. Exercises the diff-by-id
 * contract against an in-memory adapter. Both the SQLite (desktop) and IDB
 * (PWA) backends will plug into this suite once extraction lands in phase 2,
 * so any divergence between them surfaces as a red test here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { saveNotes } from './saveNotes.ts'

function createMemoryAdapter(initialNotes = [], opts = {}) {
  const notes = new Map(initialNotes.map(n => [n.id, { ...n }]))
  let lamportCounter = opts.initialLamport ?? 10
  let idCounter = 0
  const deviceId = opts.deviceId ?? 'DEV_TEST'
  const fixedNow = opts.now ?? '2026-04-21T12:00:00.000Z'

  return {
    notes, // exposed for assertions
    lamportCounter: () => lamportCounter,
    async getSeriesId(taskId) { return opts.seriesId ?? taskId },
    async selectAliveNotes(seriesId) {
      return [...notes.values()].filter(n => n.taskSeriesId === seriesId && !n.deletedAt)
    },
    async softDeleteNote(id, now, lts, did) {
      const n = notes.get(id)
      if (n) {
        n.deletedAt = now
        n.updatedAt = now
        n.lamportTs = lts
        n.deviceId = did
      }
    },
    async upsertNote(note) { notes.set(note.id, { ...note }) },
    getDeviceId() { return deviceId },
    async nextLamport(_did) { return ++lamportCounter },
    now() { return fixedNow },
    generateId() { return `NEW_${++idCounter}` },
  }
}

describe('shared saveNotes', () => {
  let adapter
  beforeEach(() => {
    adapter = createMemoryAdapter([
      { id: 'n1', taskSeriesId: 'T', content: 'First', createdAt: 1000, updatedAt: null, deletedAt: null, lamportTs: 5, deviceId: 'DEV_PREV' },
      { id: 'n2', taskSeriesId: 'T', content: 'Second', createdAt: 2000, updatedAt: null, deletedAt: null, lamportTs: 5, deviceId: 'DEV_PREV' },
    ])
  })

  it('preserves id and updates content for an edited note', async () => {
    await saveNotes(adapter, 'T', [{ id: 'n1', content: 'First edited' }, { id: 'n2', content: 'Second' }])
    const n1 = adapter.notes.get('n1')
    expect(n1.content).toBe('First edited')
    expect(n1.deletedAt).toBeNull()
    expect(n1.lamportTs).toBeGreaterThan(5)
    expect(n1.deviceId).toBe('DEV_TEST')
  })

  it('soft-deletes alive notes that are missing from the incoming set', async () => {
    await saveNotes(adapter, 'T', [{ id: 'n1', content: 'First' }])
    const n2 = adapter.notes.get('n2')
    expect(n2.deletedAt).toBe('2026-04-21T12:00:00.000Z')
    expect(n2.lamportTs).toBeGreaterThan(5)
  })

  it('generates a new id when the incoming note has none', async () => {
    await saveNotes(adapter, 'T', [
      { id: 'n1', content: 'First' },
      { id: 'n2', content: 'Second' },
      { content: 'Freshly added' },
    ])
    const fresh = [...adapter.notes.values()].find(n => n.content === 'Freshly added')
    expect(fresh).toBeTruthy()
    expect(fresh.id).toMatch(/^NEW_/)
    expect(fresh.createdAt).toBeGreaterThan(0)
  })

  it('trims content and drops whitespace-only entries (deletes their ids)', async () => {
    await saveNotes(adapter, 'T', [
      { id: 'n1', content: '  First  ' },
      { id: 'n2', content: '   ' }, // whitespace-only — treated as absent
    ])
    const n1 = adapter.notes.get('n1')
    const n2 = adapter.notes.get('n2')
    expect(n1.content).toBe('First')
    expect(n1.deletedAt).toBeNull()
    expect(n2.deletedAt).toBe('2026-04-21T12:00:00.000Z')
  })

  it('collapses duplicate incoming ids to a single upsert (last write wins)', async () => {
    await saveNotes(adapter, 'T', [
      { id: 'n1', content: 'First' },
      { id: 'n1', content: 'First v2' },
      { id: 'n2', content: 'Second' },
    ])
    const n1 = adapter.notes.get('n1')
    expect(n1.content).toBe('First v2')
    // n2 must remain alive; only two notes total (no ghost from duplicate).
    const alive = [...adapter.notes.values()].filter(n => !n.deletedAt)
    expect(alive).toHaveLength(2)
  })

  it('soft-deletes every alive note when the incoming set is empty', async () => {
    await saveNotes(adapter, 'T', [])
    for (const n of adapter.notes.values()) {
      expect(n.deletedAt).toBe('2026-04-21T12:00:00.000Z')
    }
  })

  it('accepts createdAt as an ISO string and normalises to epoch ms', async () => {
    await saveNotes(adapter, 'T2_empty', [
      { content: 'From string', createdAt: '2026-04-01T00:00:00.000Z' },
    ])
    const fresh = [...adapter.notes.values()].find(n => n.content === 'From string')
    expect(fresh).toBeTruthy()
    expect(typeof fresh.createdAt).toBe('number')
    expect(fresh.createdAt).toBe(Date.parse('2026-04-01T00:00:00.000Z'))
  })

  it('falls back to now when createdAt is missing or unparseable', async () => {
    const before = Date.now()
    await saveNotes(adapter, 'T2_empty', [
      { content: 'No date' },
      { content: 'Bad date', createdAt: 'not a date' },
    ])
    const after = Date.now()
    for (const note of [...adapter.notes.values()].filter(n => n.content === 'No date' || n.content === 'Bad date')) {
      expect(note.createdAt).toBeGreaterThanOrEqual(before)
      expect(note.createdAt).toBeLessThanOrEqual(after)
    }
  })

  it('bumps lamportTs/deviceId/updatedAt on every written row (insert or edit)', async () => {
    await saveNotes(adapter, 'T', [
      { id: 'n1', content: 'First edited' }, // edit
      { content: 'New one' },                  // insert
    ])
    const n1 = adapter.notes.get('n1')
    const newOne = [...adapter.notes.values()].find(n => n.content === 'New one')
    expect(n1.lamportTs).toBeGreaterThan(5)
    expect(n1.deviceId).toBe('DEV_TEST')
    expect(n1.updatedAt).toBe('2026-04-21T12:00:00.000Z')
    expect(newOne.lamportTs).toBe(n1.lamportTs) // same batch
    expect(newOne.deviceId).toBe('DEV_TEST')
    expect(newOne.updatedAt).toBe('2026-04-21T12:00:00.000Z')
  })

  it('does not touch notes belonging to a different task series', async () => {
    adapter.notes.set('other', {
      id: 'other', taskSeriesId: 'OTHER', content: 'Untouched',
      createdAt: 500, updatedAt: null, deletedAt: null, lamportTs: 5, deviceId: 'DEV_PREV',
    })
    await saveNotes(adapter, 'T', []) // clears T, OTHER must remain alive
    const other = adapter.notes.get('other')
    expect(other.deletedAt).toBeNull()
    expect(other.content).toBe('Untouched')
  })
})
