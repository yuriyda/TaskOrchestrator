/**
 * Unit tests for core/taskActions.js — the shared business logic module.
 *
 * Uses an in-memory adapter to test storage-agnostic logic
 * without any real DB (SQLite or IndexedDB).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FULL_CYCLE, BLOCKED_CYCLE,
  computeNextCycleStatus,
  buildNextOccurrence,
  handleTaskDone,
  handleTaskUndone,
  spawnIdFor,
  findRecurringDuplicates,
  isTaskBlocked,
} from './taskActions.js'

// Pin "today" to a fixed date so buildNextOccurrence's today-anchored output
// stays deterministic. Each test that needs a different baseline calls
// vi.setSystemTime(...) explicitly.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-01T12:00:00')) })
afterEach(() => { vi.useRealTimers() })

// ─── In-memory storage adapter ─────────────────────────────────────────────

function createMemoryAdapter(initialTasks = []) {
  const tasks = new Map(initialTasks.map(t => [t.id, { ...t }]))

  return {
    tasks, // exposed for assertions

    getTask: async (id) => tasks.get(id) || null,

    insertTask: async (task) => { tasks.set(task.id, { ...task }) },

    findInboxDependents: async (taskId) =>
      [...tasks.values()].filter(t => t.dependsOn === taskId && t.status === 'inbox' && !t.deletedAt),

    isBlockerActive: async (taskId) => {
      const t = tasks.get(taskId)
      return t ? (t.status !== 'done' && !t.deletedAt) : false
    },

    activateTask: async (id, lts, did) => {
      const t = tasks.get(id)
      if (t) {
        t.status = 'active'
        t.updatedAt = new Date().toISOString()
        t.lamportTs = lts
        t.deviceId = did
      }
    },

    softDeleteTask: async (id, lts, did) => {
      const t = tasks.get(id)
      if (!t) return
      const now = new Date().toISOString()
      t.deletedAt = now
      t.updatedAt = now
      t.lamportTs = lts
      t.deviceId = did
    },

    resurrectTask: async (task) => { tasks.set(task.id, { ...task }) },
  }
}

let idCounter = 0
function testId() { return `test-${++idCounter}` }

// ─── computeNextCycleStatus ────────────────────────────────────────────────

describe('computeNextCycleStatus', () => {
  it('cycles through full cycle: inbox → active → done → cancelled → inbox', () => {
    expect(computeNextCycleStatus('inbox', false)).toBe('active')
    expect(computeNextCycleStatus('active', false)).toBe('done')
    expect(computeNextCycleStatus('done', false)).toBe('cancelled')
    expect(computeNextCycleStatus('cancelled', false)).toBe('inbox')
  })

  it('cycles through blocked cycle: inbox → cancelled → inbox', () => {
    expect(computeNextCycleStatus('inbox', true)).toBe('cancelled')
    expect(computeNextCycleStatus('cancelled', true)).toBe('inbox')
  })

  it('blocked task cannot reach active or done', () => {
    // Starting from any status, a blocked task never reaches active/done
    let status = 'inbox'
    const visited = new Set()
    for (let i = 0; i < 10; i++) {
      status = computeNextCycleStatus(status, true)
      visited.add(status)
    }
    expect(visited.has('active')).toBe(false)
    expect(visited.has('done')).toBe(false)
  })

  it('returns first element of cycle for unknown status', () => {
    expect(computeNextCycleStatus('unknown', false)).toBe('inbox')
    expect(computeNextCycleStatus('unknown', true)).toBe('inbox')
  })
})

// ─── buildNextOccurrence ───────────────────────────────────────────────────

describe('buildNextOccurrence', () => {
  it('returns null for non-recurring task', () => {
    const task = { id: '1', title: 'One-off', recurrence: null, due: '2026-04-01' }
    expect(buildNextOccurrence(task, testId, 5, 'dev1')).toBeNull()
  })

  it('returns null for null task', () => {
    expect(buildNextOccurrence(null, testId, 5, 'dev1')).toBeNull()
  })

  it('spawns daily recurrence', () => {
    const task = { id: '1', title: 'Daily standup', recurrence: 'daily', due: '2026-04-01', priority: 2 }
    const next = buildNextOccurrence(task, testId, 5, 'dev1')
    expect(next).not.toBeNull()
    expect(next.title).toBe('Daily standup')
    expect(next.due).toBe('2026-04-02')
    expect(next.status).toBe('active')
    expect(next.recurrence).toBe('daily')
    expect(next.priority).toBe(2)
    expect(next.lamportTs).toBe(5)
    expect(next.deviceId).toBe('dev1')
    expect(next.dependsOn).toBeNull()
    expect(next.completedAt).toBeNull()
    expect(next.deletedAt).toBeNull()
  })

  it('spawns weekly recurrence', () => {
    const task = { id: '1', title: 'Weekly review', recurrence: 'weekly', due: '2026-04-01' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-04-08')
  })

  it('spawns monthly recurrence', () => {
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    const task = { id: '1', title: 'Monthly report', recurrence: 'monthly', due: '2026-03-15' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-04-15')
  })

  it('spawns RRULE recurrence (FREQ=WEEKLY;INTERVAL=2)', () => {
    const task = { id: '1', title: 'Biweekly', recurrence: 'FREQ=WEEKLY;INTERVAL=2', due: '2026-04-01' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-04-15')
  })

  it('anchors next due to today, not task.due — early completion (forgiveness)', () => {
    vi.setSystemTime(new Date('2026-04-27T12:00:00'))
    // Task scheduled for tomorrow (Apr 28), user does it a day early.
    const task = { id: '1', title: 'Daily mindful', recurrence: 'daily', due: '2026-04-28' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-04-28') // not Apr 29
  })

  it('anchors next due to today, not task.due — late completion (skip catch-up)', () => {
    vi.setSystemTime(new Date('2026-04-28T12:00:00'))
    // Task overdue by 3 days; user finally does it today.
    const task = { id: '1', title: 'Daily mindful', recurrence: 'daily', due: '2026-04-25' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-04-29') // not Apr 26
  })

  it('forgives weekly misses too', () => {
    vi.setSystemTime(new Date('2026-04-28T12:00:00'))
    const task = { id: '1', title: 'Weekly review', recurrence: 'weekly', due: '2026-04-14' }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    expect(next.due).toBe('2026-05-05') // today + 7d, not the missed Apr 21
  })

  it('handles SQL row field names (snake_case)', () => {
    const sqlRow = {
      id: '1', title: 'SQL task', recurrence: 'daily', due: '2026-04-01',
      priority: 1, list_name: 'Work', flow_id: 'sprint', rtm_series_id: 'RTM1',
      tags: '["tag1"]', personas: '["alice"]',
    }
    const next = buildNextOccurrence(sqlRow, testId, 1, 'dev1')
    expect(next.list).toBe('Work')
    expect(next.flowId).toBe('sprint')
    expect(next.rtmSeriesId).toBe('RTM1')
    expect(next.tags).toEqual(['tag1'])
    expect(next.personas).toEqual(['alice'])
  })

  it('handles IDB record field names (camelCase)', () => {
    const idbRecord = {
      id: '1', title: 'IDB task', recurrence: 'daily', due: '2026-04-01',
      priority: 3, list: 'Home', flowId: 'routine', rtmSeriesId: null,
      tags: ['grocery'], personas: [],
    }
    const next = buildNextOccurrence(idbRecord, testId, 1, 'dev1')
    expect(next.list).toBe('Home')
    expect(next.flowId).toBe('routine')
    expect(next.tags).toEqual(['grocery'])
    expect(next.personas).toEqual([])
  })

  it('preserves tags and personas as copies (no mutation)', () => {
    const tags = ['a', 'b']
    const task = { id: '1', title: 'T', recurrence: 'daily', due: '2026-04-01', tags, personas: [] }
    const next = buildNextOccurrence(task, testId, 1, 'dev1')
    next.tags.push('c')
    expect(tags).toEqual(['a', 'b']) // original unchanged
  })

  it('spawn id is deterministic — same parent always yields the same id', () => {
    const task = { id: 'PARENT-1', title: 'T', recurrence: 'daily', due: '2026-04-01' }
    const a = buildNextOccurrence(task, testId, 1, 'dev1')
    const b = buildNextOccurrence(task, testId, 2, 'dev2')
    expect(a.id).toBe(b.id)
    expect(a.id).toBe(spawnIdFor('PARENT-1'))
  })

  it('spawn ids differ for different parents', () => {
    const a = buildNextOccurrence({ id: 'P1', title: 'T', recurrence: 'daily', due: null }, testId, 1, 'dev1')
    const b = buildNextOccurrence({ id: 'P2', title: 'T', recurrence: 'daily', due: null }, testId, 1, 'dev1')
    expect(a.id).not.toBe(b.id)
  })

  it('returns null for unknown recurrence pattern', () => {
    const task = { id: '1', title: 'T', recurrence: 'every_full_moon', due: '2026-04-01' }
    expect(buildNextOccurrence(task, testId, 1, 'dev1')).toBeNull()
  })
})

// ─── handleTaskDone ────────────────────────────────────────────────────────

describe('handleTaskDone', () => {
  it('spawns next occurrence for recurring task', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Weekly review', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.spawned).not.toBeNull()
    expect(result.spawned.title).toBe('Weekly review')
    expect(result.spawned.due).toBe('2026-04-08')
    expect(result.spawned.status).toBe('active')
    // New task should be in the store
    expect(ops.tasks.has(result.spawned.id)).toBe(true)
  })

  it('does NOT spawn for non-recurring task', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'One-off', status: 'done', recurrence: null, due: '2026-04-01' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.spawned).toBeNull()
    expect(ops.tasks.size).toBe(1) // no new task
  })

  it('activates dependent task when blocker is done', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'done', recurrence: null },
      { id: 'T2', title: 'Dependent', status: 'inbox', dependsOn: 'T1' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.activated).toHaveLength(1)
    expect(result.activated[0].title).toBe('Dependent')
    expect(ops.tasks.get('T2').status).toBe('active')
  })

  it('does NOT activate dependent if blocker is NOT done', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Completed', status: 'done', recurrence: null },
      // T2 depends on T3 (not T1), and T3 is still active
      { id: 'T3', title: 'Still active', status: 'active' },
      { id: 'T2', title: 'Dependent', status: 'inbox', dependsOn: 'T3' },
    ])
    // Complete T1 — T2 depends on T3, not T1, so no activation
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.activated).toHaveLength(0)
    expect(ops.tasks.get('T2').status).toBe('inbox')
  })

  it('activates multiple dependents', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'done', recurrence: null },
      { id: 'T2', title: 'Dep A', status: 'inbox', dependsOn: 'T1' },
      { id: 'T3', title: 'Dep B', status: 'inbox', dependsOn: 'T1' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.activated).toHaveLength(2)
    expect(ops.tasks.get('T2').status).toBe('active')
    expect(ops.tasks.get('T3').status).toBe('active')
  })

  it('does NOT activate already-active or done dependents', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'done', recurrence: null },
      { id: 'T2', title: 'Already active', status: 'active', dependsOn: 'T1' },
      { id: 'T3', title: 'Already done', status: 'done', dependsOn: 'T1' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    // findInboxDependents only returns inbox tasks, so these won't be found
    expect(result.activated).toHaveLength(0)
  })

  it('handles both spawn + activate in single call', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Recurring blocker', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
      { id: 'T2', title: 'Waiting', status: 'inbox', dependsOn: 'T1' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.spawned).not.toBeNull()
    expect(result.spawned.due).toBe('2026-04-08')
    expect(result.activated).toHaveLength(1)
    expect(result.activated[0].title).toBe('Waiting')
    expect(ops.tasks.size).toBe(3) // T1 + T2 + spawned
  })

  it('handles missing task gracefully', async () => {
    const ops = createMemoryAdapter([])
    const result = await handleTaskDone(ops, 'NONEXISTENT', testId, 10, 'dev1')
    expect(result.spawned).toBeNull()
    expect(result.activated).toHaveLength(0)
  })

  it('does NOT activate soft-deleted dependent', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'done', recurrence: null },
      { id: 'T2', title: 'Deleted dep', status: 'inbox', dependsOn: 'T1', deletedAt: '2026-04-01' },
    ])
    const result = await handleTaskDone(ops, 'T1', testId, 10, 'dev1')
    expect(result.activated).toHaveLength(0)
    expect(ops.tasks.get('T2').status).toBe('inbox') // unchanged
  })

  it('unblocks dependent when blocker is soft-deleted', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Deleted blocker', status: 'active', deletedAt: '2026-04-01' },
      { id: 'T2', title: 'Was blocked', status: 'inbox', dependsOn: 'T1' },
    ])
    // T2 depends on T1 which is deleted — should NOT be blocked
    // (handleTaskDone won't find T2 via findInboxDependents('T1') since T1 isn't the completed task here,
    // but isTaskBlocked should return false for T2)
    expect(await ops.isBlockerActive('T1')).toBe(false)
  })

  it('does NOT respawn when the task was already done (done → done update)', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Weekly', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
    ])
    const first = await handleTaskDone(ops, 'T1', testId, 10, 'dev1', 'active')
    expect(first.spawned).not.toBeNull()
    // Second update re-sends status='done' (edit-dialog save, redo, repeated "Done")
    const second = await handleTaskDone(ops, 'T1', testId, 11, 'dev1', 'done')
    expect(second.spawned).toBeNull()
    expect(second.activated).toHaveLength(0)
    expect(ops.tasks.size).toBe(2) // T1 + one spawn, no duplicates
  })

  it('does NOT duplicate when a live spawn already exists (double-complete across devices)', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Yearly', status: 'done', recurrence: 'FREQ=YEARLY;INTERVAL=1', due: '2026-04-01', tags: [], personas: [] },
    ])
    // Device A completes; the spawn syncs over to device B, which completes too.
    const a = await handleTaskDone(ops, 'T1', testId, 10, 'devA', 'active')
    expect(a.spawned).not.toBeNull()
    const b = await handleTaskDone(ops, 'T1', testId, 11, 'devB', 'active')
    expect(b.spawned).toBeNull() // same deterministic id already present and alive
    expect(ops.tasks.size).toBe(2)
  })

  it('resurrects a soft-deleted spawn on re-completion', async () => {
    vi.setSystemTime(new Date('2026-04-01T12:00:00'))
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Daily', status: 'done', recurrence: 'daily', due: '2026-04-01', tags: [], personas: [] },
    ])
    const first = await handleTaskDone(ops, 'T1', testId, 10, 'dev1', 'active')
    const spawnId = first.spawned.id
    // Revert the completion — spawn gets soft-deleted
    await handleTaskUndone(ops, 'T1', 11, 'dev1')
    expect(ops.tasks.get(spawnId).deletedAt).toBeTruthy()
    // Re-complete a day later — the same row comes back with a fresh due
    vi.setSystemTime(new Date('2026-04-02T12:00:00'))
    const again = await handleTaskDone(ops, 'T1', testId, 12, 'dev1', 'active')
    expect(again.spawned.id).toBe(spawnId)
    expect(again.resurrected).toBe(true)
    const row = ops.tasks.get(spawnId)
    expect(row.deletedAt).toBeNull()
    expect(row.due).toBe('2026-04-03')
    expect(ops.tasks.size).toBe(2)
  })
})

// ─── handleTaskUndone ──────────────────────────────────────────────────────

describe('handleTaskUndone', () => {
  async function completeThen(opsTasks) {
    const ops = createMemoryAdapter(opsTasks)
    const done = await handleTaskDone(ops, 'T1', testId, 10, 'dev1', 'active')
    return { ops, spawnId: done.spawned?.id }
  }

  it('soft-deletes the untouched spawn on completion revert', async () => {
    const { ops, spawnId } = await completeThen([
      { id: 'T1', title: 'Weekly', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
    ])
    const result = await handleTaskUndone(ops, 'T1', 11, 'dev1')
    expect(result.removedSpawn).toBe(spawnId)
    expect(ops.tasks.get(spawnId).deletedAt).toBeTruthy()
  })

  it('keeps a spawn the user already edited (updatedAt ≠ createdAt)', async () => {
    const { ops, spawnId } = await completeThen([
      { id: 'T1', title: 'Weekly', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
    ])
    const spawn = ops.tasks.get(spawnId)
    spawn.updatedAt = '2026-04-02T00:00:00.000Z' // simulated user edit
    const result = await handleTaskUndone(ops, 'T1', 11, 'dev1')
    expect(result.removedSpawn).toBeNull()
    expect(ops.tasks.get(spawnId).deletedAt).toBeFalsy()
  })

  it('keeps a spawn that was already completed itself', async () => {
    const { ops, spawnId } = await completeThen([
      { id: 'T1', title: 'Weekly', status: 'done', recurrence: 'weekly', due: '2026-04-01', tags: [], personas: [] },
    ])
    ops.tasks.get(spawnId).status = 'done'
    const result = await handleTaskUndone(ops, 'T1', 11, 'dev1')
    expect(result.removedSpawn).toBeNull()
  })

  it('is a no-op for non-recurring tasks and missing spawns', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'One-off', status: 'done', recurrence: null },
      { id: 'T2', title: 'Recurring, never completed', status: 'active', recurrence: 'daily', tags: [], personas: [] },
    ])
    expect((await handleTaskUndone(ops, 'T1', 11, 'dev1')).removedSpawn).toBeNull()
    expect((await handleTaskUndone(ops, 'T2', 11, 'dev1')).removedSpawn).toBeNull()
    expect(ops.tasks.size).toBe(2)
  })
})

// ─── spawnIdFor ────────────────────────────────────────────────────────────

describe('spawnIdFor', () => {
  it('produces a 26-char Crockford Base32 id (ULID shape)', () => {
    // Input is the example ULID from the ULID spec README
    const id = spawnIdFor('01ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('is stable across calls and differs between parents', () => {
    expect(spawnIdFor('A')).toBe(spawnIdFor('A'))
    expect(spawnIdFor('A')).not.toBe(spawnIdFor('B'))
    // A spawn chain keeps producing fresh ids
    const first = spawnIdFor('P')
    const second = spawnIdFor(first)
    expect(second).not.toBe(first)
  })
})

// ─── findRecurringDuplicates ───────────────────────────────────────────────

describe('findRecurringDuplicates', () => {
  it('keeps the newest instance per series and returns the rest', () => {
    const dups = findRecurringDuplicates([
      { id: 'OLD', rtmSeriesId: 'S1', recurrence: 'yearly', status: 'active', createdAt: '2023-01-15T00:00:00.000Z' },
      { id: 'NEW', rtmSeriesId: 'S1', recurrence: 'yearly', status: 'active', createdAt: '2026-01-15T00:00:00.000Z' },
    ])
    expect(dups).toEqual(['OLD'])
  })

  it('handles snake_case SQLite rows', () => {
    const dups = findRecurringDuplicates([
      { id: 'A', rtm_series_id: 'S1', recurrence: 'yearly', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'B', rtm_series_id: 'S1', recurrence: 'yearly', status: 'active', created_at: '2026-02-01T00:00:00.000Z' },
      { id: 'C', rtm_series_id: 'S1', recurrence: 'yearly', status: 'active', created_at: '2026-03-01T00:00:00.000Z' },
    ])
    expect(dups.sort()).toEqual(['A', 'B'])
  })

  it('breaks createdAt ties by id (deterministic across devices)', () => {
    const dups = findRecurringDuplicates([
      { id: 'AAA', rtmSeriesId: 'S1', recurrence: 'daily', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'ZZZ', rtmSeriesId: 'S1', recurrence: 'daily', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    expect(dups).toEqual(['AAA']) // ZZZ wins the tie
  })

  it('ignores done, deleted, non-recurring and series-less tasks', () => {
    const dups = findRecurringDuplicates([
      { id: 'A', rtmSeriesId: 'S1', recurrence: 'yearly', status: 'active', createdAt: '2026-01-01' },
      { id: 'B', rtmSeriesId: 'S1', recurrence: 'yearly', status: 'done',   createdAt: '2026-02-01' },
      { id: 'C', rtmSeriesId: 'S1', recurrence: 'yearly', status: 'active', createdAt: '2026-03-01', deletedAt: '2026-04-01' },
      { id: 'D', rtmSeriesId: 'S1', recurrence: null,     status: 'active', createdAt: '2026-04-01' },
      { id: 'E', rtmSeriesId: null, recurrence: 'yearly',  status: 'active', createdAt: '2026-05-01' },
      { id: 'F', rtmSeriesId: 'S2', recurrence: 'yearly', status: 'active', createdAt: '2026-06-01' },
    ])
    expect(dups).toEqual([]) // only one live active per series remains
  })
})

// ─── isTaskBlocked ─────────────────────────────────────────────────────────

describe('isTaskBlocked', () => {
  it('returns false for task without dependency', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Free', status: 'inbox', dependsOn: null },
    ])
    expect(await isTaskBlocked(ops, 'T1')).toBe(false)
  })

  it('returns true when dependency is not done', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'active' },
      { id: 'T2', title: 'Blocked', status: 'inbox', dependsOn: 'T1' },
    ])
    expect(await isTaskBlocked(ops, 'T2')).toBe(true)
  })

  it('returns false when dependency is done', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Blocker', status: 'done' },
      { id: 'T2', title: 'Unblocked', status: 'inbox', dependsOn: 'T1' },
    ])
    expect(await isTaskBlocked(ops, 'T2')).toBe(false)
  })

  it('returns false when dependency does not exist', async () => {
    const ops = createMemoryAdapter([
      { id: 'T2', title: 'Orphan', status: 'inbox', dependsOn: 'DELETED' },
    ])
    // Deleted dependency = not blocking
    expect(await isTaskBlocked(ops, 'T2')).toBe(false)
  })

  it('returns false for missing task', async () => {
    const ops = createMemoryAdapter([])
    expect(await isTaskBlocked(ops, 'NONEXISTENT')).toBe(false)
  })

  it('returns false when dependency is soft-deleted', async () => {
    const ops = createMemoryAdapter([
      { id: 'T1', title: 'Deleted blocker', status: 'active', deletedAt: '2026-04-01' },
      { id: 'T2', title: 'Was blocked', status: 'inbox', dependsOn: 'T1' },
    ])
    expect(await isTaskBlocked(ops, 'T2')).toBe(false)
  })
})

// ─── Constants ─────────────────────────────────────────────────────────────

describe('Cycle constants', () => {
  it('FULL_CYCLE has 4 statuses', () => {
    expect(FULL_CYCLE).toEqual(['inbox', 'active', 'done', 'cancelled'])
  })

  it('BLOCKED_CYCLE skips active and done', () => {
    expect(BLOCKED_CYCLE).toEqual(['inbox', 'cancelled'])
    expect(BLOCKED_CYCLE).not.toContain('active')
    expect(BLOCKED_CYCLE).not.toContain('done')
  })
})
