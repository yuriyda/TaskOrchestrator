/**
 * PWA integration tests — verifies IndexedDB store and basic React rendering.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import { useBrowserTaskStore } from './store/browserStore'

let testCounter = 0
afterEach(() => cleanup())

// Helper component that exposes store with unique DB per test
function StoreHarness({ dbName, children }) {
  const store = useBrowserTaskStore(dbName)
  return children(store)
}

function renderStore() {
  const dbName = `test-db-${++testCounter}-${Date.now()}`
  let storeRef = { current: null }
  const result = render(
    <StoreHarness dbName={dbName}>
      {(store) => {
        storeRef.current = store
        return (
          <div>
            <div data-testid="ready">{store.ready ? 'yes' : 'no'}</div>
            <div data-testid="count">{store.tasks.length}</div>
            {store.tasks.map(t => (
              <div key={t.id} data-testid="task" data-status={t.status} data-priority={t.priority}>
                {t.title}
              </div>
            ))}
          </div>
        )
      }}
    </StoreHarness>
  )

  const waitReady = () => waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('yes'), { timeout: 5000 })
  return { ...result, store: storeRef, waitReady }
}

describe('BrowserStore — IndexedDB', () => {
  it('initializes with empty task list', async () => {
    const { waitReady } = renderStore()
    await waitReady()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('addTask creates a task with correct defaults', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Buy milk' }) })
    // Wait longer for IndexedDB + React state
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'), { timeout: 3000 })

    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    const task = store.current.tasks[0]
    expect(task.status).toBe('inbox')
    expect(task.priority).toBe(4)
    expect(task.lamportTs).toBeGreaterThan(0)
    expect(task.deviceId).toBeTruthy()
  })

  it('addTask with custom status and priority', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Urgent fix', status: 'active', priority: 1 })
    })

    await waitFor(() => {
      const el = screen.getByTestId('task')
      expect(el.dataset.status).toBe('active')
      expect(el.dataset.priority).toBe('1')
    })
  })

  it('bulkCycle rotates status: inbox → active → done → cancelled → inbox', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Cycle test' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    const id = store.current.tasks[0].id

    await act(async () => { await store.current.bulkCycle(new Set([id])) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.status).toBe('active'))

    await act(async () => { await store.current.bulkCycle(new Set([id])) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.status).toBe('done'))

    await act(async () => { await store.current.bulkCycle(new Set([id])) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.status).toBe('cancelled'))

    await act(async () => { await store.current.bulkCycle(new Set([id])) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.status).toBe('inbox'))
  })

  it('bulkDelete soft-deletes (task disappears)', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Delete me' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    const id = store.current.tasks[0].id
    await act(async () => { await store.current.bulkDelete(new Set([id])) })
    await waitReady()
  })

  it('bulkPriority changes priority', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Reprio' }) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.priority).toBe('4'))

    const id = store.current.tasks[0].id
    await act(async () => { await store.current.bulkPriority(new Set([id]), 1) })
    await waitFor(() => expect(screen.getByTestId('task').dataset.priority).toBe('1'))
  })

  it('bulkStatus sets done with completedAt', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Complete me' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    const id = store.current.tasks[0].id
    await act(async () => { await store.current.bulkStatus(new Set([id]), 'done') })
    await waitFor(() => {
      expect(screen.getByTestId('task').dataset.status).toBe('done')
      expect(store.current.tasks[0].completedAt).toBeTruthy()
    })
  })

  it('clearAll removes everything', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Task 1' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'), { timeout: 3000 })
    await act(async () => { await store.current.addTask({ title: 'Task 2' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'), { timeout: 3000 })

    await act(async () => { await store.current.clearAll() })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'), { timeout: 3000 })
  })

  it('lamportTs increments with each operation', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'First' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
    const lts1 = store.current.tasks[0].lamportTs

    await act(async () => { await store.current.addTask({ title: 'Second' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
    const lts2 = store.current.tasks[1].lamportTs

    expect(lts2).toBeGreaterThan(lts1)
  })

  it('deviceId is consistent across tasks', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'A' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'), { timeout: 3000 })
    await act(async () => { await store.current.addTask({ title: 'B' }) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'), { timeout: 3000 })

    expect(store.current.tasks[0].deviceId).toBe(store.current.tasks[1].deviceId)
  })
})
