import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { useBrowserTaskStore } from './browserStore'

let testCounter = 0

function StoreHarness({ dbName, children }) {
  const store = useBrowserTaskStore(dbName)
  return children(store)
}

function renderStore() {
  const dbName = `browser-store-lookups-${++testCounter}-${Date.now()}`
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

afterEach(() => cleanup())

describe('BrowserStore lookup lifecycle TDD', () => {
  it('removes orphaned lookups after deleting the last task that references them', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({
        title: 'Lonely refs',
        list: 'Work',
        tags: ['urgent'],
        personas: ['Alice'],
        flowId: 'Sprint',
      })
    })

    await waitFor(() => {
      expect(store.current.lists).toContain('Work')
      expect(store.current.tags).toContain('urgent')
      expect(store.current.personas).toContain('Alice')
      expect(store.current.flows).toContain('Sprint')
    }, { timeout: 3000 })

    const taskId = store.current.tasks[0].id
    await act(async () => {
      await store.current.bulkDelete(new Set([taskId]))
    })

    await waitFor(() => {
      expect(store.current.tasks).toHaveLength(0)
      expect(store.current.lists).not.toContain('Work')
      expect(store.current.tags).not.toContain('urgent')
      expect(store.current.personas).not.toContain('Alice')
      expect(store.current.flows).not.toContain('Sprint')
    }, { timeout: 3000 })
  })

  it('removes only the lookups that lost their last reference during updateTask', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({
        title: 'Drop refs',
        list: 'Work',
        tags: ['keep', 'drop'],
        personas: ['Alice'],
        flowId: 'Sprint',
      })
      await store.current.addTask({
        title: 'Keeps shared tag',
        tags: ['keep'],
      })
    })

    await waitFor(() => expect(store.current.tasks).toHaveLength(2), { timeout: 3000 })

    const editedTaskId = store.current.tasks.find(t => t.title === 'Drop refs').id
    await act(async () => {
      await store.current.updateTask(editedTaskId, {
        list: null,
        tags: ['keep'],
        personas: [],
        flowId: null,
      })
    })

    await waitFor(() => {
      expect(store.current.lists).not.toContain('Work')
      expect(store.current.tags).toContain('keep')
      expect(store.current.tags).not.toContain('drop')
      expect(store.current.personas).not.toContain('Alice')
      expect(store.current.flows).not.toContain('Sprint')
    }, { timeout: 3000 })
  })

  it('keeps a flow lookup when flow metadata still exists without task references', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Flow task', flowId: 'Sprint' })
      await store.current.updateFlow('Sprint', {
        description: 'Flow kept by metadata',
        color: '#336699',
        deadline: '2026-05-01',
      })
    })

    await waitFor(() => {
      expect(store.current.flows).toContain('Sprint')
      expect(store.current.flowMeta.Sprint).toEqual({
        description: 'Flow kept by metadata',
        color: '#336699',
        deadline: '2026-05-01',
      })
    }, { timeout: 3000 })

    const taskId = store.current.tasks[0].id
    await act(async () => {
      await store.current.bulkDelete(new Set([taskId]))
    })

    await waitFor(() => {
      expect(store.current.tasks).toHaveLength(0)
      expect(store.current.flows).toContain('Sprint')
      expect(store.current.flowMeta.Sprint).toEqual({
        description: 'Flow kept by metadata',
        color: '#336699',
        deadline: '2026-05-01',
      })
    }, { timeout: 3000 })
  })
})
