import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'

const mockState = vi.hoisted(() => ({
  syncRunner: async () => ({ applied: 0, outdated: 0, uploaded: 0 }),
  capturedDb: null,
  capturedPkg: null,
}))

vi.mock('./googleDrivePwa.js', () => ({
  isConnected: async () => true,
  connect: async () => true,
  disconnect: async () => {},
  syncWithDrive: async (db, computeSyncPackageFn, importSyncPackageFn) => {
    mockState.capturedDb = db
    return mockState.syncRunner({ db, computeSyncPackageFn, importSyncPackageFn })
  },
  getConfig: async () => ({ hasToken: true, clientId: 'test-client' }),
  startOAuthRedirect: () => {},
  extractAuthCode: () => null,
}))

import { useBrowserTaskStore } from './browserStore'

let testCounter = 0

function StoreHarness({ dbName, children }) {
  const store = useBrowserTaskStore(dbName)
  return children(store)
}

function renderStore() {
  const dbName = `browser-store-sync-${++testCounter}-${Date.now()}`
  const storeRef = { current: null }
  const result = render(
    <StoreHarness dbName={dbName}>
      {(store) => {
        storeRef.current = store
        return <div data-testid="ready">{store.ready ? 'yes' : 'no'}</div>
      }}
    </StoreHarness>
  )

  const waitReady = () => waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('yes'), { timeout: 5000 })
  return { ...result, store: storeRef, waitReady }
}

function makeRemoteTask(overrides = {}) {
  return {
    id: 'remote-task',
    title: 'Remote task',
    status: 'active',
    priority: 2,
    list: null,
    due: '2026-04-21',
    recurrence: null,
    flowId: 'Sprint',
    dependsOn: null,
    tags: [],
    personas: [],
    url: null,
    dateStart: null,
    estimate: null,
    postponed: 0,
    rtmSeriesId: null,
    completedAt: null,
    createdAt: '2026-04-21T10:00:00.000Z',
    updatedAt: '2026-04-21T10:00:00.000Z',
    deletedAt: null,
    deviceId: 'REMOTE_DEVICE',
    lamportTs: 5,
    notes: [],
    subtasks: [],
    ...overrides,
  }
}

describe('BrowserStore sync regressions', () => {
  beforeEach(() => {
    mockState.syncRunner = async () => ({ applied: 0, outdated: 0, uploaded: 0 })
    mockState.capturedDb = null
    mockState.capturedPkg = null
  })

  afterEach(() => {
    cleanup()
  })

  it('includes notes in the package uploaded during sync', async () => {
    mockState.syncRunner = async ({ db, computeSyncPackageFn }) => {
      mockState.capturedPkg = await computeSyncPackageFn(db, {})
      return { applied: 0, outdated: 0, uploaded: mockState.capturedPkg.tasks.length }
    }

    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Task with note', flowId: 'Sprint' })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })

    await act(async () => {
      await store.current.saveNotes(store.current.tasks[0].id, ['First synced note'])
      await store.current.updateFlow('Sprint', {
        description: 'Remote flow metadata',
        color: '#123456',
        deadline: '2026-05-01',
      })
    })

    await act(async () => {
      await store.current.gdriveSyncNow()
    })

    expect(mockState.capturedPkg.notes).toHaveLength(1)
  })

  it('includes flowMeta in the package uploaded during sync', async () => {
    mockState.syncRunner = async ({ db, computeSyncPackageFn }) => {
      mockState.capturedPkg = await computeSyncPackageFn(db, {})
      return { applied: 0, outdated: 0, uploaded: mockState.capturedPkg.tasks.length }
    }

    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Task with flow', flowId: 'Sprint' })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })

    await act(async () => {
      await store.current.updateFlow('Sprint', {
        description: 'Remote flow metadata',
        color: '#123456',
        deadline: '2026-05-01',
      })
    })

    await act(async () => {
      await store.current.gdriveSyncNow()
    })

    expect(mockState.capturedPkg.flowMeta).toEqual([
      {
        name: 'Sprint',
        description: 'Remote flow metadata',
        color: '#123456',
        deadline: '2026-05-01',
      },
    ])
  })

  it('imports remote notes into local store state', async () => {
    mockState.syncRunner = async ({ db, importSyncPackageFn }) => {
      const result = await importSyncPackageFn(db, {
        type: 'sync_package',
        deviceId: 'REMOTE_DEVICE',
        vectorClock: { REMOTE_DEVICE: 5 },
        tasks: [makeRemoteTask()],
        notes: [
          {
            id: 'remote-note',
            taskSeriesId: 'remote-task',
            content: 'Remote note',
            createdAt: 1713693600000,
            deletedAt: null,
            updatedAt: '2026-04-21T10:00:00.000Z',
            lamportTs: 5,
            deviceId: 'REMOTE_DEVICE',
          },
        ],
        lists: [],
        tags: [],
        flows: ['Sprint'],
        personas: [],
        flowMeta: [
          {
            name: 'Sprint',
            description: 'Imported flow metadata',
            color: '#654321',
            deadline: '2026-06-01',
          },
        ],
      })
      return { applied: result.stats.applied, outdated: result.stats.outdated, uploaded: 0 }
    }

    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.gdriveSyncNow()
    })

    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    expect(store.current.tasks[0].notes).toHaveLength(1)
    expect(store.current.tasks[0].notes[0].content).toBe('Remote note')
  })

  it('imports remote flowMeta into local store state', async () => {
    mockState.syncRunner = async ({ db, importSyncPackageFn }) => {
      const result = await importSyncPackageFn(db, {
        type: 'sync_package',
        deviceId: 'REMOTE_DEVICE',
        vectorClock: { REMOTE_DEVICE: 5 },
        tasks: [makeRemoteTask()],
        notes: [],
        lists: [],
        tags: [],
        flows: ['Sprint'],
        personas: [],
        flowMeta: [
          {
            name: 'Sprint',
            description: 'Imported flow metadata',
            color: '#654321',
            deadline: '2026-06-01',
          },
        ],
      })
      return { applied: result.stats.applied, outdated: result.stats.outdated, uploaded: 0 }
    }

    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.gdriveSyncNow()
    })

    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    expect(store.current.flowMeta.Sprint).toEqual({
      description: 'Imported flow metadata',
      color: '#654321',
      deadline: '2026-06-01',
    })
  })

  it('stores remote note tombstones instead of dropping soft-deleted notes', async () => {
    mockState.syncRunner = async ({ db, importSyncPackageFn }) => {
      const result = await importSyncPackageFn(db, {
        type: 'sync_package',
        deviceId: 'REMOTE_DEVICE',
        vectorClock: { REMOTE_DEVICE: 8 },
        tasks: [makeRemoteTask({ id: 'task-with-deleted-note', title: 'Task with tombstone' })],
        notes: [
          {
            id: 'deleted-note',
            taskSeriesId: 'task-with-deleted-note',
            content: 'Deleted remotely',
            createdAt: 1713693600000,
            deletedAt: '2026-04-20T10:00:00.000Z',
            updatedAt: '2026-04-20T10:00:00.000Z',
            lamportTs: 8,
            deviceId: 'REMOTE_DEVICE',
          },
        ],
        lists: [],
        tags: [],
        flows: [],
        personas: [],
        flowMeta: [],
      })
      return { applied: result.stats.applied, outdated: result.stats.outdated, uploaded: 0 }
    }

    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.gdriveSyncNow()
    })

    const noteRow = await mockState.capturedDb.get('notes', 'deleted-note')
    expect(noteRow?.deletedAt).toBe('2026-04-20T10:00:00.000Z')
  })
})
