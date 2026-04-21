// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getWeekDates } from './dayPlanner.js'

describe('getWeekDates timezone regression', () => {
  let realToISOString
  let RealDate

  beforeEach(() => {
    RealDate = Date
    realToISOString = Date.prototype.toISOString
  })

  afterEach(() => {
    Date.prototype.toISOString = realToISOString
  })

  it('returns local calendar dates instead of UTC-shifted ISO slices', () => {
    // Emulate a UTC+14 environment: local noon stringifies to previous UTC day.
    Date.prototype.toISOString = function toISOStringShifted() {
      const shifted = new RealDate(this.getTime() - 14 * 60 * 60 * 1000)
      return realToISOString.call(shifted)
    }

    const dates = getWeekDates('2026-03-30')

    expect(dates[0]).toBe('2026-03-30')
    expect(dates[6]).toBe('2026-04-05')
  })
})
