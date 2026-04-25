import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import MobileApp from './MobileApp'
import { useBrowserTaskStore } from './store/browserStore'
import { localIsoDate } from '@shared/core/date.js'

let testCounter = 0

function renderApp(dbName = `mobile-persist-${++testCounter}-${Date.now()}`) {
  const storeRef = { current: null }

  function Wrapper() {
    const store = useBrowserTaskStore(dbName)
    storeRef.current = store
    if (!store.ready) return <div data-testid="loading">Loading</div>
    return <MobileApp store={store} />
  }

  const result = render(<Wrapper />)
  const waitReady = () => waitFor(() => expect(screen.getByTestId('mobile-app')).toBeInTheDocument(), { timeout: 5000 })
  return { ...result, store: storeRef, waitReady, dbName }
}

async function disableDefaultFilters() {
  await act(async () => {
    // Inactive chips show only their icon — match by textContent OR title.
    const chips = [...screen.getByTestId('mobile-app').querySelectorAll('button.rounded-full')]
    const findChip = (label) => chips.find(b =>
      b.textContent.trim().startsWith(label) || (b.getAttribute('title') || '').startsWith(label))
    const allChip = findChip('All')
    const todayChip = findChip('Today')
    if (allChip) fireEvent.click(allChip)
    if (todayChip) fireEvent.click(todayChip)
  })
}

function getDrawerListBtn(name) {
  const listSection = screen.getByText('Lists').parentElement
  return Array.from(listSection.querySelectorAll('button')).find(b => b.textContent.includes(name))
}

beforeEach(() => {
  try { localStorage.clear() } catch {}
})

afterEach(() => cleanup())

describe('Mobile persistence regressions', () => {
  it('persists the widened status/date view across remounts', async () => {
    const dbName = `mobile-persist-status-${Date.now()}`
    const first = renderApp(dbName)
    await first.waitReady()

    await act(async () => {
      await first.store.current.addTask({ title: 'Persist my filters' })
    })
    await waitFor(() => expect(first.store.current.tasks).toHaveLength(1), { timeout: 3000 })

    expect(screen.queryByText('Persist my filters')).toBeNull()

    await disableDefaultFilters()
    await waitFor(() => expect(screen.getByText('Persist my filters')).toBeInTheDocument(), { timeout: 3000 })

    first.unmount()

    const second = renderApp(dbName)
    await second.waitReady()

    await waitFor(() => {
      expect(screen.getByText('Persist my filters')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('persists the selected list filter across remounts', async () => {
    const dbName = `mobile-persist-list-${Date.now()}`
    const today = localIsoDate(new Date())
    const first = renderApp(dbName)
    await first.waitReady()

    await act(async () => {
      await first.store.current.addTask({ title: 'Work task', list: 'Work', status: 'active', due: today })
      await first.store.current.addTask({ title: 'Home task', list: 'Home', status: 'active', due: today })
    })

    await waitFor(() => {
      expect(screen.getByText('Work task')).toBeInTheDocument()
      expect(screen.getByText('Home task')).toBeInTheDocument()
    }, { timeout: 3000 })

    const menuBtn = screen.getByTestId('mobile-app').querySelector('header button')
    fireEvent.click(menuBtn)
    await waitFor(() => expect(getDrawerListBtn('Work')).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(getDrawerListBtn('Work'))

    await waitFor(() => {
      expect(screen.getByText('Work task')).toBeInTheDocument()
      expect(screen.queryByText('Home task')).toBeNull()
      expect(screen.getByText(/@Work/)).toBeInTheDocument()
    }, { timeout: 3000 })

    first.unmount()

    const second = renderApp(dbName)
    await second.waitReady()

    await waitFor(() => {
      expect(screen.getByText('Work task')).toBeInTheDocument()
      expect(screen.queryByText('Home task')).toBeNull()
      expect(screen.getByText(/@Work/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
