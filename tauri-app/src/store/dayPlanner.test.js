// @vitest-environment node
/**
 * Tests for Day Planner store — time utilities and data model helpers.
 * Tests cover: time conversion, snap-to-grid, overlap detection, week dates.
 */
import { describe, it, expect } from 'vitest'
import {
  timeToMinutes,
  minutesToTime,
  snapToGrid,
  defaultEndTime,
  timesOverlap,
  getWeekDates,
} from './dayPlanner.js'

describe('timeToMinutes', () => {
  it('converts 00:00 to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0)
  })

  it('converts 09:00 to 540', () => {
    expect(timeToMinutes('09:00')).toBe(540)
  })

  it('converts 23:59 to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439)
  })

  it('converts 12:30 to 750', () => {
    expect(timeToMinutes('12:30')).toBe(750)
  })
})

describe('minutesToTime', () => {
  it('converts 0 to 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00')
  })

  it('converts 540 to 09:00', () => {
    expect(minutesToTime(540)).toBe('09:00')
  })

  it('converts 1439 to 23:59', () => {
    expect(minutesToTime(1439)).toBe('23:59')
  })

  it('converts 750 to 12:30', () => {
    expect(minutesToTime(750)).toBe('12:30')
  })

  it('pads single-digit hours', () => {
    expect(minutesToTime(60)).toBe('01:00')
  })
})

describe('snapToGrid', () => {
  it('snaps to 30-min grid by default', () => {
    expect(snapToGrid(545)).toBe(540) // 9:05 → 9:00
    expect(snapToGrid(555)).toBe(570) // 9:15 → 9:30
    expect(snapToGrid(570)).toBe(570) // 9:30 → 9:30 (exact)
  })

  it('snaps to 15-min grid', () => {
    expect(snapToGrid(547, 15)).toBe(540) // 9:07 → 9:00 (rounds down)
    expect(snapToGrid(548, 15)).toBe(555) // 9:08 → 9:15 (rounds up)
    expect(snapToGrid(540, 15)).toBe(540) // 9:00 → 9:00
  })

  it('snaps to 60-min grid', () => {
    expect(snapToGrid(550, 60)).toBe(540) // 9:10 → 9:00
    expect(snapToGrid(570, 60)).toBe(600) // 9:30 → 10:00
  })
})

describe('defaultEndTime', () => {
  it('adds 60 minutes by default', () => {
    expect(defaultEndTime('09:00')).toBe('10:00')
  })

  it('adds custom duration', () => {
    expect(defaultEndTime('09:00', 30)).toBe('09:30')
    expect(defaultEndTime('14:00', 120)).toBe('16:00')
  })

  it('handles crossing hour boundaries', () => {
    expect(defaultEndTime('09:30', 60)).toBe('10:30')
    expect(defaultEndTime('23:00', 60)).toBe('24:00')
  })
})

describe('timesOverlap', () => {
  it('detects overlapping ranges', () => {
    expect(timesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true)
    expect(timesOverlap('09:30', '10:30', '09:00', '10:00')).toBe(true)
  })

  it('detects contained ranges', () => {
    expect(timesOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true)
  })

  it('returns false for non-overlapping ranges', () => {
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false)
    expect(timesOverlap('09:00', '10:00', '11:00', '12:00')).toBe(false)
  })

  it('returns false for adjacent ranges (touching but not overlapping)', () => {
    expect(timesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false)
  })
})

describe('getWeekDates', () => {
  it('returns 7 dates starting from Monday', () => {
    const dates = getWeekDates('2026-04-05') // Sunday
    expect(dates).toHaveLength(7)
    // April 5, 2026 is Sunday → Monday is March 30
    // Wait, let me check: 2026-04-05 is a Sunday
    // Monday offset from Sunday = -6
    // So Monday = March 30
    expect(dates[0]).toBe('2026-03-30') // Mon
    expect(dates[6]).toBe('2026-04-05') // Sun
  })

  it('returns correct week for a Wednesday', () => {
    const dates = getWeekDates('2026-04-01') // Wednesday
    expect(dates[0]).toBe('2026-03-30') // Mon
    expect(dates[2]).toBe('2026-04-01') // Wed
    expect(dates[6]).toBe('2026-04-05') // Sun
  })

  it('returns correct week for a Monday', () => {
    const dates = getWeekDates('2026-03-30') // Monday
    expect(dates[0]).toBe('2026-03-30') // Mon
    expect(dates[6]).toBe('2026-04-05') // Sun
  })

  it('handles month boundaries', () => {
    const dates = getWeekDates('2026-01-01') // Thursday
    expect(dates[0]).toBe('2025-12-29') // Mon (previous year!)
    expect(dates[3]).toBe('2026-01-01') // Thu
  })

  it('all dates are ISO format YYYY-MM-DD', () => {
    const dates = getWeekDates('2026-06-15')
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('roundtrip timeToMinutes ↔ minutesToTime', () => {
  it('preserves value through conversion cycle', () => {
    const times = ['00:00', '06:30', '09:00', '12:45', '17:30', '23:59']
    for (const t of times) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t)
    }
  })
})
