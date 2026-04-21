import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar.jsx'
import { AppContext } from './AppContext.tsx'
import { buildTC } from '../core/themes.js'

function makeTask(overrides = {}) {
  return {
    id: 't1',
    title: 'Done task',
    status: 'done',
    priority: 4,
    list: null,
    due: null,
    dateStart: null,
    recurrence: null,
    flowId: null,
    dependsOn: null,
    tags: [],
    personas: [],
    url: null,
    estimate: null,
    postponed: 0,
    rtmSeriesId: null,
    completedAt: null,
    updatedAt: '2026-04-02T22:30:00.000Z',
    deletedAt: null,
    deviceId: 'DEV_A',
    lamportTs: 1,
    notes: [],
    subtasks: [],
    createdAt: '2026-04-02T22:00:00.000Z',
    ...overrides,
  }
}

function renderStatusBar(tasks) {
  const contextValue = {
    t: (key) => key,
    locale: 'en',
    setLocale: () => {},
    theme: 'dark',
    setTheme: () => {},
    resolvedTheme: 'dark',
    TC: buildTC('dark', 'default'),
    settings: {
      firstDayOfWeek: 1,
      dateFormat: 'iso',
      fontFamily: '',
      fontSize: 'normal',
      condense: false,
      colorTheme: 'default',
      clockFormat: '24h',
      newTaskActiveToday: false,
      autoSync: true,
      autoExtractUrl: true,
    },
    updateSetting: () => {},
    lists: [],
    tags: [],
    flows: [],
    flowMeta: {},
    personas: [],
    openUrl: () => {},
  }

  return render(
    <AppContext.Provider value={contextValue}>
      <StatusBar
        tasks={tasks}
        lastAction=""
        canUndo={false}
        clockFormat="24h"
        dateFormat="iso"
        autoSyncing={false}
      />
    </AppContext.Provider>
  )
}

describe('StatusBar doneToday timezone regression', () => {
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

  it('counts tasks completed late at night UTC as done today in local time', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    renderStatusBar([makeTask({ completedAt: '2026-04-02T22:30:00.000Z' })])
    expect(screen.getByText(/1 sb\.doneToday/i)).toBeInTheDocument()
  })
})
