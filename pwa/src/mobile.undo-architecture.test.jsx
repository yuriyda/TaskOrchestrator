import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import MobileApp from './MobileApp'
import { useBrowserTaskStore } from './store/browserStore'

let testCounter = 0

function renderApp(dbName = `mobile-undo-${++testCounter}-${Date.now()}`) {
  const storeRef = { current: null }

  function Wrapper() {
    const store = useBrowserTaskStore(dbName)
    storeRef.current = store
    if (!store.ready) return <div data-testid="loading">Loading</div>
    return <MobileApp store={store} />
  }

  const result = render(<Wrapper />)
  const waitReady = () => waitFor(() => expect(screen.getByTestId('mobile-app')).toBeInTheDocument(), { timeout: 5000 })
  return { ...result, store: storeRef, waitReady }
}

async function disableDefaultFilters() {
  await act(async () => {
    const chips = [...screen.getByTestId('mobile-app').querySelectorAll('button.rounded-full')]
    const allChip = chips.find(b => b.textContent.trim().startsWith('All'))
    const todayChip = chips.find(b => b.textContent.trim().startsWith('Today'))
    if (allChip) fireEvent.click(allChip)
    if (todayChip) fireEvent.click(todayChip)
  })
}

async function swipeTask(title, deltaX) {
  const card = screen.getByText(title).parentElement
  fireEvent.pointerDown(card, { clientX: 100, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(card, { clientX: 100 + deltaX, clientY: 12, pointerId: 1 })
  fireEvent.pointerUp(card, { clientX: 100 + deltaX, clientY: 12, pointerId: 1 })
}

beforeEach(() => {
  try { localStorage.clear() } catch {}
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
})

afterEach(() => cleanup())

describe('Mobile undo architecture TDD', () => {
  it('swipe-delete shows undo and restores the task', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()
    await disableDefaultFilters()

    await act(async () => {
      await store.current.addTask({ title: 'Swipe delete me' })
    })
    await waitFor(() => expect(screen.getByText('Swipe delete me')).toBeInTheDocument(), { timeout: 3000 })

    await act(async () => {
      await swipeTask('Swipe delete me', -250)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /undo|отменить/i })).toBeInTheDocument()
      expect(screen.queryByText('Swipe delete me')).toBeNull()
    }, { timeout: 3000 })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /undo|отменить/i }))
    })

    await waitFor(() => {
      expect(screen.getByText('Swipe delete me')).toBeInTheDocument()
      expect(store.current.tasks).toHaveLength(1)
      expect(store.current.tasks[0].deletedAt).toBeNull()
    }, { timeout: 3000 })
  })

  // Completion operations in PWA have fan-out side effects (spawn recurring, activate
  // dependents) that toast-undo cannot cleanly revert. Per the agreed architecture
  // (pwa-architecture-plan-2026-04-21.md Task 2, msg 2352/2354): for completion of
  // tasks with fan-out, the toast does NOT offer an Undo button — only a notification.
  // A full command-based undo is out of scope for this phase.
  it('completion of a recurring blocker does NOT show an Undo button (fan-out operation)', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()
    await disableDefaultFilters()

    await act(async () => {
      await store.current.addTask({
        title: 'Recurring blocker',
        status: 'active',
        recurrence: 'daily',
        due: '2026-04-21',
      })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })

    const blockerId = store.current.tasks[0].id
    await act(async () => {
      await store.current.addTask({
        title: 'Blocked dependent',
        status: 'inbox',
        dependsOn: [blockerId],
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Recurring blocker')).toBeInTheDocument()
      expect(screen.getByText('Blocked dependent')).toBeInTheDocument()
      expect(store.current.tasks).toHaveLength(2)
    }, { timeout: 3000 })

    await act(async () => {
      await swipeTask('Recurring blocker', 250)
    })

    // Fan-out side effects actually happened: spawn + dependent activation.
    await waitFor(() => {
      expect(store.current.tasks.filter(t => t.title === 'Recurring blocker')).toHaveLength(2)
      expect(store.current.tasks.find(t => t.title === 'Blocked dependent').status).toBe('active')
    }, { timeout: 3000 })

    // Per agreed decision: no Undo button is offered for fan-out completion.
    // The toast may show a completion message, but must NOT include an Undo control.
    expect(screen.queryByRole('button', { name: /undo|отменить/i })).toBeNull()
  })
})
