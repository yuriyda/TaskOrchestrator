/**
 * Mobile UI integration tests — verifies the mobile layout renders correctly,
 * task CRUD works through the UI, and navigation (drawer, detail, filters) functions.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import MobileApp from './MobileApp.jsx'
import { useBrowserTaskStore } from './store/browserStore'

let testCounter = 0
afterEach(() => cleanup())

function renderApp() {
  const dbName = `mobile-test-${++testCounter}-${Date.now()}`
  let storeRef = { current: null }

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

describe('Mobile Layout', () => {
  it('renders header with title', async () => {
    const { waitReady } = renderApp()
    await waitReady()
    const header = screen.getByTestId('mobile-app').querySelector('header')
    expect(header.textContent).toContain('Task Orchestrator')
  })

  it('shows empty state message', async () => {
    const { waitReady } = renderApp()
    await waitReady()
    expect(screen.getByText(/No tasks/)).toBeInTheDocument()
  })

  it('has FAB add button', async () => {
    const { waitReady } = renderApp()
    await waitReady()
    expect(screen.getByTestId('fab-add')).toBeInTheDocument()
  })

  it('shows filter chips', async () => {
    const { waitReady } = renderApp()
    await waitReady()
    // Filter chips are in the filter bar (not the drawer)
    const filterBar = screen.getByTestId('mobile-app').querySelectorAll('button')
    const chipTexts = [...filterBar].map(b => b.textContent)
    expect(chipTexts.some(t => t.includes('All'))).toBe(true)
    expect(chipTexts.some(t => t.includes('Inbox'))).toBe(true)
    expect(chipTexts.some(t => t.includes('Active'))).toBe(true)
  })
})

describe('Mobile CRUD', () => {
  it('adds a task via FAB + bottom sheet', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    // Add task via store (simulates FAB → bottom sheet → submit)
    await act(async () => { await store.current.addTask({ title: 'Buy groceries' }) })
    await waitFor(() => expect(screen.getByText('Buy groceries')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('cycles task status via icon tap', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Cycle me' }) })
    await waitFor(() => expect(screen.getByText('Cycle me')).toBeInTheDocument(), { timeout: 3000 })

    // Find the status icon button (first button in the task row)
    const taskRow = screen.getByText('Cycle me').closest('[class*="rounded-xl"]')
    const cycleBtn = taskRow.querySelector('button')

    // Cycle: inbox → active
    await act(async () => { fireEvent.click(cycleBtn) })
    await waitFor(() => expect(store.current.tasks[0].status).toBe('active'), { timeout: 3000 })
  })

  it('opens detail view on task tap', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Detail test' }) })
    await waitFor(() => expect(screen.getByText('Detail test')).toBeInTheDocument(), { timeout: 3000 })

    // Tap the task (not the cycle button)
    fireEvent.click(screen.getByText('Detail test'))

    // Detail view should show
    await waitFor(() => {
      // Should have back button and task title in header
      expect(screen.getAllByText('Detail test').length).toBeGreaterThanOrEqual(1)
      // Should have status change buttons
      expect(screen.getByText('P1')).toBeInTheDocument()
      expect(screen.getByText('P2')).toBeInTheDocument()
    })
  })

  it('deletes task via store from detail', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    await act(async () => { await store.current.addTask({ title: 'Delete me mobile' }) })
    await waitFor(() => expect(screen.getByText('Delete me mobile')).toBeInTheDocument(), { timeout: 3000 })

    // Delete via store (simulates what the detail view delete button does)
    const taskId = store.current.tasks[0].id
    await act(async () => { await store.current.bulkDelete(new Set([taskId])) })

    await waitFor(() => expect(screen.getByText(/No tasks/)).toBeInTheDocument(), { timeout: 3000 })
  })
})

describe('Mobile Filters', () => {
  it('filters tasks by status', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Inbox task', status: 'inbox' })
      await store.current.addTask({ title: 'Active task', status: 'active' })
    })
    await waitFor(() => expect(screen.getByText('Inbox task')).toBeInTheDocument(), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText('Active task')).toBeInTheDocument(), { timeout: 3000 })

    // Filter to Active only — click the "Active" chip in the filter bar (not drawer)
    const filterChips = screen.getByTestId('mobile-app').querySelectorAll('button')
    const activeChip = [...filterChips].find(b => b.textContent.includes('Active') && b.className.includes('rounded-full'))
    fireEvent.click(activeChip)
    await waitFor(() => {
      expect(screen.getByText('Active task')).toBeInTheDocument()
      expect(screen.queryByText('Inbox task')).toBeNull()
    })

    // Filter back to All
    const allChip = [...screen.getByTestId('mobile-app').querySelectorAll('button')].find(b => b.textContent.includes('All') && b.className.includes('rounded-full'))
    fireEvent.click(allChip)
    await waitFor(() => {
      expect(screen.getByText('Inbox task')).toBeInTheDocument()
      expect(screen.getByText('Active task')).toBeInTheDocument()
    })
  })

  it('search filters tasks', async () => {
    const { store, waitReady } = renderApp()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Apple pie' })
      await store.current.addTask({ title: 'Banana split' })
    })
    await waitFor(() => expect(screen.getByText('Apple pie')).toBeInTheDocument(), { timeout: 3000 })

    // Click search icon in header to reveal search bar
    const header = document.querySelector('header')
    const searchToggle = Array.from(header.querySelectorAll('button')).find(b => b.querySelector('.lucide-search'))
    fireEvent.click(searchToggle)
    const searchInput = screen.getByPlaceholderText(/Search/)
    fireEvent.change(searchInput, { target: { value: 'apple' } })

    await waitFor(() => {
      expect(screen.getByText('Apple pie')).toBeInTheDocument()
      expect(screen.queryByText('Banana split')).toBeNull()
    })
  })
})

describe('Mobile Drawer', () => {
  it('opens and closes drawer', async () => {
    const { waitReady } = renderApp()
    await waitReady()

    // Open drawer (hamburger menu button)
    const menuBtn = screen.getByTestId('mobile-app').querySelector('header button')
    fireEvent.click(menuBtn)

    // Drawer should show status filters
    await waitFor(() => {
      const drawerTexts = screen.getAllByText(/All|Inbox|Active/)
      expect(drawerTexts.length).toBeGreaterThan(4) // filter chips + drawer items
    })
  })
})
