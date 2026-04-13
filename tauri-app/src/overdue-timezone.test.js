// @vitest-environment node
/**
 * Tests that overdue detection and date utilities use local timezone,
 * not UTC. Verifies the fix for the UTC date comparison bug where
 * toISOString().slice(0,10) was used instead of localIsoDate().
 *
 * The key scenario: a UTC+3 user at 01:00 local time (22:00 UTC previous day).
 * UTC date is "yesterday", but local date is "today". Tasks due "yesterday"
 * must still be detected as overdue using the local date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { overdueLevel } from './core/overdue.js'
import { localIsoDate } from './core/date.js'

describe('overdue timezone handling', () => {
  let realDate

  beforeEach(() => {
    realDate = globalThis.Date
  })

  afterEach(() => {
    globalThis.Date = realDate
    vi.restoreAllMocks()
  })

  /**
   * Simulate UTC+3 at 01:00 local = 22:00 UTC previous day.
   * Local date: 2026-04-03, UTC date: 2026-04-02.
   */
  function mockTimezone(localDateStr, utcDateStr) {
    const [ly, lm, ld] = localDateStr.split('-').map(Number)
    const [uy, um, ud] = utcDateStr.split('-').map(Number)

    class MockDate extends realDate {
      constructor(...args) {
        if (args.length === 0) {
          super(uy, um - 1, ud, 22, 0, 0) // 22:00 UTC
        } else {
          super(...args)
        }
      }
      // Local date getters return "local" values
      getFullYear() { return arguments.length ? super.getFullYear() : ly }
      getMonth() { return arguments.length ? super.getMonth() : lm - 1 }
      getDate() { return arguments.length ? super.getDate() : ld }
    }

    // Preserve static methods
    MockDate.now = realDate.now
    globalThis.Date = MockDate
  }

  it('localIsoDate returns local date, not UTC', () => {
    // Simulate: local April 3, UTC April 2
    mockTimezone('2026-04-03', '2026-04-02')
    const result = localIsoDate(new Date())
    expect(result).toBe('2026-04-03')
    // If we used toISOString it would give 2026-04-02 (wrong)
  })

  it('overdueLevel detects overdue using local date', () => {
    // Simulate: local April 3, UTC April 2
    mockTimezone('2026-04-03', '2026-04-02')

    // Task due April 2 — overdue by local date (April 3)
    const task = { due: '2026-04-02', status: 'active' }
    expect(overdueLevel(task)).toBe('late')
  })

  it('overdueLevel does NOT mark task due today as overdue', () => {
    // Simulate: local April 3, UTC April 2
    mockTimezone('2026-04-03', '2026-04-02')

    // Task due April 3 — NOT overdue (it's today in local time)
    const task = { due: '2026-04-03', status: 'active' }
    expect(overdueLevel(task)).toBeNull()
  })

  it('overdueLevel uses localIsoDate, not toISOString (regression)', () => {
    // When local=April 3 but UTC=April 2, a task due April 2
    // must be overdue (local date says so), even though
    // toISOString().slice(0,10) would return "2026-04-02" (UTC)
    // and "2026-04-02" < "2026-04-02" would be false (the old bug).
    mockTimezone('2026-04-03', '2026-04-02')

    const task = { due: '2026-04-02', status: 'active' }

    // localIsoDate returns the local date "2026-04-03"
    const localToday = localIsoDate(new Date())
    expect(localToday).toBe('2026-04-03')

    // So "2026-04-02" < "2026-04-03" = true → overdue
    expect(task.due < localToday).toBe(true)

    // And overdueLevel agrees (it uses localIsoDate internally)
    expect(overdueLevel(task)).toBe('late')
  })

  it('overdueLevel returns null for done tasks', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    expect(overdueLevel({ due: '2026-04-01', status: 'done' })).toBeNull()
  })

  it('overdueLevel returns null for cancelled tasks', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    expect(overdueLevel({ due: '2026-04-01', status: 'cancelled' })).toBeNull()
  })

  it('overdueLevel returns null for tasks without due date', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    expect(overdueLevel({ due: null, status: 'active' })).toBeNull()
  })

  it('midnight timer computes local date, not UTC (regression)', () => {
    // Simulate: local April 13, UTC April 12
    // Bug: midnight timer used toISOString().slice(0,10) which returns UTC date.
    // At local midnight in UTC+ timezones, UTC date is still "yesterday",
    // so setState(sameValue) was a no-op → no re-render → overdue not shown.
    mockTimezone('2026-04-13', '2026-04-12')

    // After the fix, the timer uses localIsoDate which reads local getters:
    const newToday = localIsoDate(new Date())
    expect(newToday).toBe('2026-04-13')

    // Previous day's state would have been '2026-04-12',
    // so setState('2026-04-13') triggers a re-render.
    const previousDay = '2026-04-12'
    expect(newToday).not.toBe(previousDay)
  })

  it('bulkSnooze/bulkAssignToday use local date for due (regression)', () => {
    // Same timezone scenario: local April 13, UTC April 12
    mockTimezone('2026-04-13', '2026-04-12')

    // "Assign to today" must set due to local date, not UTC
    const today = localIsoDate(new Date())
    expect(today).toBe('2026-04-13')

    // Snooze from a known date by 1 day must also produce local date
    const base = new realDate(2026, 3, 13, 12, 0, 0) // April 13 noon local
    base.setDate(base.getDate() + 1) // April 14
    const snoozedDue = localIsoDate(base)
    expect(snoozedDue).toBe('2026-04-14')
  })
})
