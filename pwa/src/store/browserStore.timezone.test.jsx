import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { useBrowserTaskStore } from './browserStore'

let testCounter = 0

function StoreHarness({ dbName, children }) {
  const store = useBrowserTaskStore(dbName)
  return children(store)
}

function renderStore() {
  const dbName = `browser-store-timezone-${++testCounter}-${Date.now()}`
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

describe('BrowserStore bulkAssignToday timezone regression', () => {
  let RealDate

  beforeEach(() => {
    RealDate = globalThis.Date
  })

  afterEach(() => {
    cleanup()
    globalThis.Date = RealDate
  })

  function mockTimezone(localDateStr, utcDateStr) {
    const [ly, lm, ld] = localDateStr.split('-').map(Number)
    const [uy, um, ud] = utcDateStr.split('-').map(Number)

    class MockDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(uy, um - 1, ud, 22, 0, 0)
        else super(...args)
      }
      getFullYear() { return ly }
      getMonth() { return lm - 1 }
      getDate() { return ld }
    }

    MockDate.now = RealDate.now
    globalThis.Date = MockDate
  }

  it('assigns the local date, not the UTC date slice', async () => {
    mockTimezone('2026-04-13', '2026-04-12')
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Today me' })
    })

    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    const taskId = store.current.tasks[0].id

    await act(async () => {
      await store.current.bulkAssignToday(new Set([taskId]))
    })

    await waitFor(() => {
      expect(store.current.tasks[0].due).toBe('2026-04-13')
      expect(store.current.tasks[0].status).toBe('active')
    }, { timeout: 3000 })
  })
})
