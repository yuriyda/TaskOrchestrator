// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextDue } from './core/recurrence.js'

describe('recurrence timezone handling', () => {
  let RealDate

  beforeEach(() => {
    RealDate = globalThis.Date
  })

  afterEach(() => {
    globalThis.Date = RealDate
  })

  function mockTimezone(localDateStr, utcDateStr) {
    const [ly, lm, ld] = localDateStr.split('-').map(Number)
    const [uy, um, ud] = utcDateStr.split('-').map(Number)

    class MockDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(uy, um - 1, ud, 22, 0, 0)
          this.__mockNow = true
        } else {
          super(...args)
          this.__mockNow = false
        }
      }
      getFullYear() { return this.__mockNow ? ly : super.getFullYear() }
      getMonth() { return this.__mockNow ? lm - 1 : super.getMonth() }
      getDate() { return this.__mockNow ? ld : super.getDate() }
    }

    MockDate.now = RealDate.now
    globalThis.Date = MockDate
  }

  it('uses local today, not UTC today, when recurrence has no due date', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    expect(nextDue(null, 'daily')).toBe('2026-04-04')
  })

  it('uses the same local-date baseline for RRULE recurrence without due', () => {
    mockTimezone('2026-04-03', '2026-04-02')
    expect(nextDue(null, 'FREQ=WEEKLY;INTERVAL=1')).toBe('2026-04-10')
  })
})
