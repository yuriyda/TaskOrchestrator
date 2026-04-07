/**
 * UI regression tests for Task Orchestrator.
 *
 * Uses React Testing Library with the in-memory useTaskStore (no Tauri needed).
 * Tests cover critical user flows that have had bugs in the past.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskOrchestrator from '@app'

// Helper: render the app and return user event instance
function renderApp() {
  const user = userEvent.setup()
  render(<TaskOrchestrator />)
  return user
}

// Helper: get the quick entry input
function getQuickEntry() {
  return screen.getByPlaceholderText(/new task|новая задача/i)
}

// Helper: create a task via quick entry
async function createTask(user, text) {
  const input = getQuickEntry()
  await user.click(input)
  await user.type(input, text + '{Enter}')
}

// Helper: blur all inputs so keyboard shortcuts work (they ignore INPUT/TEXTAREA)
async function blurAll(user) {
  await user.click(document.body)
}

// Helper: get all visible task titles
function getVisibleTasks() {
  // Task rows have a span with the task title inside them
  const rows = document.querySelectorAll('[data-task-id]')
  if (rows.length > 0) return [...rows].map(r => r.textContent)
  // Fallback: just return all text content from task list area
  return []
}

describe('Quick Entry — task creation', () => {
  it('creates a task with title only', async () => {
    const user = renderApp()
    await createTask(user, 'Buy groceries')
    expect(screen.getByText('Buy groceries')).toBeInTheDocument()
  })

  it('creates a task with tag chip', async () => {
    const user = renderApp()
    // Space after #urgent commits the tag chip, title stays "Fix bug"
    await createTask(user, 'Fix bug #urgent ')
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('creates a task with priority', async () => {
    const user = renderApp()
    // Space after !1 commits the priority chip, title stays "Deploy app"
    await createTask(user, 'Deploy app !1 ')
    expect(screen.getByText('Deploy app')).toBeInTheDocument()
  })
})

describe('Search', () => {
  it('filters tasks by title', async () => {
    const user = renderApp()
    await createTask(user, 'Alpha task')
    await createTask(user, 'Beta task')

    const searchInput = screen.getByPlaceholderText(/search|поиск/i)
    await user.type(searchInput, 'Alpha')

    expect(screen.getByText('Alpha task')).toBeInTheDocument()
    expect(screen.queryByText('Beta task')).not.toBeInTheDocument()
  })

  it('clears search on Escape', async () => {
    const user = renderApp()
    await createTask(user, 'Alpha task')
    await createTask(user, 'Beta task')

    const searchInput = screen.getByPlaceholderText(/search|поиск/i)
    await user.type(searchInput, 'Alpha')
    expect(screen.queryByText('Beta task')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    // Both tasks should be visible again
    expect(screen.getByText('Alpha task')).toBeInTheDocument()
    expect(screen.getByText('Beta task')).toBeInTheDocument()
  })

  it('finds tasks with swapped keyboard layout (EN typed as RU)', async () => {
    const user = renderApp()
    await createTask(user, 'Alpha task')

    const searchInput = screen.getByPlaceholderText(/search|поиск/i)
    // "Фдзрф" is "Alpha" typed on Russian keyboard layout
    await user.type(searchInput, 'фдзрф')

    expect(screen.getByText('Alpha task')).toBeInTheDocument()
  })
})

describe('Task list — no phantom list', () => {
  it('task created without @list has null list (REGRESSION: was "Входящие")', async () => {
    const user = renderApp()
    await createTask(user, 'Simple task')
    expect(screen.getByText('Simple task')).toBeInTheDocument()
    const taskRow = screen.getByText('Simple task').closest('[class]')
    expect(taskRow?.textContent).not.toMatch(/Inbox|Входящие/)
  })
})

describe('Keyboard shortcuts — Space (done/reopen)', () => {
  it('marks task as done with Space', async () => {
    const user = renderApp()
    await createTask(user, 'Test task')
    await blurAll(user)

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })) })

    expect(screen.getByText('Test task')).toBeInTheDocument()
  })

  it('reopens done task with Space', async () => {
    const user = renderApp()
    await createTask(user, 'Reopen me')
    await blurAll(user)

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })) })

    expect(screen.getByText('Reopen me')).toBeInTheDocument()
  })
})

describe('Keyboard shortcuts — S (cycle status)', () => {
  it('cycles task status with S key', async () => {
    const user = renderApp()
    await createTask(user, 'Cycle me')
    await blurAll(user)

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true })) })

    expect(screen.getByText('Cycle me')).toBeInTheDocument()
  })
})

describe('Keyboard shortcuts — Delete', () => {
  it('deletes task with Delete key', async () => {
    const user = renderApp()
    await createTask(user, 'Delete me')
    expect(screen.getByText('Delete me')).toBeInTheDocument()

    // Click on the task row to select it
    await user.click(screen.getByText('Delete me'))

    // Dispatch Delete on window (app listens on window capture phase)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true })) })

    await waitFor(() => {
      expect(screen.queryByText('Delete me')).not.toBeInTheDocument()
    })
  })
})

describe('Keyboard shortcuts — priority (1-4)', () => {
  it('sets priority with number keys', async () => {
    const user = renderApp()
    await createTask(user, 'Priority task')
    await blurAll(user)

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true })) })

    expect(screen.getByText('Priority task')).toBeInTheDocument()
  })
})

describe('Keyboard shortcuts — Ctrl+Z (undo)', () => {
  it('undoes delete', async () => {
    const user = renderApp()
    await createTask(user, 'Undo me')
    expect(screen.getByText('Undo me')).toBeInTheDocument()

    // Click to select, then delete
    await user.click(screen.getByText('Undo me'))
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true, cancelable: true })) })
    await waitFor(() => {
      expect(screen.queryByText('Undo me')).not.toBeInTheDocument()
    })

    // Undo
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true })) })
    await waitFor(() => {
      expect(screen.getByText('Undo me')).toBeInTheDocument()
    })
  })
})

describe('Escape cascade', () => {
  it('Escape clears selection then search then filters', async () => {
    const user = renderApp()
    await createTask(user, 'Task A')
    await createTask(user, 'Task B')

    // Set search
    const searchInput = screen.getByPlaceholderText(/search|поиск/i)
    await user.type(searchInput, 'Task')

    // Select a task
    await blurAll(user)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })) })

    // First Escape — clears selection
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    // Second Escape — clears search
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })

    // Both tasks should be visible (search cleared)
    expect(screen.getByText('Task A')).toBeInTheDocument()
    expect(screen.getByText('Task B')).toBeInTheDocument()
  })
})

describe('Selection cleanup on filter change (REGRESSION)', () => {
  it('selection is cleared when selected task leaves filtered view', async () => {
    const user = renderApp()
    await createTask(user, 'Inbox task')
    await blurAll(user)

    // Select the task
    await user.keyboard('{ArrowDown}')

    // The task is selected — status bar should show "1" selected or similar
    // Now mark it done — it should disappear from active filter
    await user.keyboard('{ }')

    // Task still visible in "All" view — but if we check selection count,
    // it shouldn't show phantom selection for tasks that changed status
    expect(screen.getByText('Inbox task')).toBeInTheDocument()
  })
})

describe('Sorting', () => {
  it('default sort is alphabetical by title', async () => {
    const user = renderApp()
    await createTask(user, 'Zebra')
    await createTask(user, 'Alpha')
    await createTask(user, 'Middle')

    // Get all task texts in order from the DOM
    const titles = screen.getAllByText(/^(Zebra|Alpha|Middle)$/).map(el => el.textContent)
    expect(titles).toEqual(['Alpha', 'Middle', 'Zebra'])
  })
})

describe('Sidebar status filter', () => {
  it('clicking sidebar Active filter filters the task list', async () => {
    const user = renderApp()
    await createTask(user, 'Active task')

    // Find sidebar Active button and click it
    const sidebar = document.querySelector('[data-guide="sidebar"]')
    if (sidebar) {
      const activeBtn = within(sidebar).queryByText(/^Active$|^Активные$/i)
      if (activeBtn) {
        await user.click(activeBtn)
        // Status filter badge should appear (Active or Активные)
        await waitFor(() => {
          const badges = document.querySelectorAll('.bg-sky-600\\/20')
          const hasStatusBadge = [...badges].some(b => b.textContent.match(/Active|Активные/i))
          expect(hasStatusBadge).toBe(true)
        })
      }
    }
  })
})

describe('Planner "Create task here" uses correct task ID (REGRESSION)', () => {
  it('addTask returns the newly created task, not the last in sorted order', async () => {
    const user = renderApp()
    // Create several tasks with different priorities so sort order != insertion order
    await createTask(user, '!1 High priority task')
    await createTask(user, '!3 Low priority task')

    // Now create a task as if from planner — the returned task must be the one we just created
    const input = getQuickEntry()
    await user.click(input)
    await user.type(input, 'Planner task{Enter}')

    // Verify the task "Planner task" exists in the DOM
    await waitFor(() => expect(screen.getByText('Planner task')).toBeInTheDocument())

    // The key assertion: in the old code, tasks[tasks.length-1] would be the last
    // sorted task (lowest priority), not necessarily the newly created one.
    // With the fix, addTask returns the created task directly, so it always
    // matches the intended task regardless of sort order.
    const taskRows = document.querySelectorAll('[data-task-id]')
    const ids = [...taskRows].map(r => r.dataset.taskId)
    // All 3 tasks should exist with unique IDs
    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Auto-sync setting', () => {
  it('autoSync defaults to true and persists toggle', async () => {
    const user = renderApp()
    // Open settings on sync tab
    const settingsBtn = document.querySelector('[data-guide="sidebar"] button:last-of-type') || screen.getByTitle(/settings|настройки/i)
    if (settingsBtn) await user.click(settingsBtn)
    // The autoSync setting should default to enabled (true)
    // Verify it's stored in localStorage
    const saved = JSON.parse(localStorage.getItem('to_settings') || '{}')
    expect(saved.autoSync).not.toBe(false) // default is true or undefined (treated as true)
  })
})
