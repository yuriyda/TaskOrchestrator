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
  const dbName = `browser-store-savenotes-${++testCounter}-${Date.now()}`
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

describe('BrowserStore saveNotes diff-by-id', () => {
  it('preserves note.id when editing content of an existing note', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Task with notes' })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    const taskId = store.current.tasks[0].id

    // First save — new note, store assigns an id
    await act(async () => {
      await store.current.saveNotes(taskId, [{ content: 'Original' }])
    })
    await waitFor(() => expect(store.current.tasks[0].notes || []).toHaveLength(1), { timeout: 3000 })
    const firstId = store.current.tasks[0].notes[0].id
    expect(firstId).toBeTruthy()

    // Second save — same id, updated content. Must NOT create a new row.
    await act(async () => {
      await store.current.saveNotes(taskId, [{ id: firstId, content: 'Edited' }])
    })
    await waitFor(() => {
      const notes = store.current.tasks[0].notes || []
      expect(notes).toHaveLength(1)
      expect(notes[0].id).toBe(firstId)
      expect(notes[0].content).toBe('Edited')
    }, { timeout: 3000 })
  })

  it('soft-deletes notes whose id is missing from the new set', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Task' })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    const taskId = store.current.tasks[0].id

    await act(async () => {
      await store.current.saveNotes(taskId, [
        { content: 'Keep me' },
        { content: 'Delete me' },
      ])
    })
    await waitFor(() => expect(store.current.tasks[0].notes).toHaveLength(2), { timeout: 3000 })
    const [note1, note2] = store.current.tasks[0].notes

    // Keep only the first — second should be soft-deleted.
    await act(async () => {
      await store.current.saveNotes(taskId, [{ id: note1.id, content: 'Keep me' }])
    })
    await waitFor(() => {
      const notes = store.current.tasks[0].notes || []
      expect(notes).toHaveLength(1)
      expect(notes[0].id).toBe(note1.id)
      expect(notes.find(n => n.id === note2.id)).toBeUndefined()
    }, { timeout: 3000 })
  })

  it('assigns an id when the incoming note has none', async () => {
    const { store, waitReady } = renderStore()
    await waitReady()

    await act(async () => {
      await store.current.addTask({ title: 'Task' })
    })
    await waitFor(() => expect(store.current.tasks).toHaveLength(1), { timeout: 3000 })
    const taskId = store.current.tasks[0].id

    await act(async () => {
      await store.current.saveNotes(taskId, [{ content: 'Fresh' }])
    })
    await waitFor(() => {
      const notes = store.current.tasks[0].notes || []
      expect(notes).toHaveLength(1)
      expect(typeof notes[0].id).toBe('string')
      expect(notes[0].id.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
