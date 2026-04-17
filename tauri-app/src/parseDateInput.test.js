/**
 * Tests for parseDateInput — smart date parsing with prediction.
 * Covers: ISO, natural language, day-of-week, relative offsets,
 * bare day numbers, DD.MM, month name combos.
 */
import { describe, it, expect } from 'vitest'
import { parseDateInput, localIsoDate } from './core/date.js'

// Helpers
function todayISO() { return localIsoDate(new Date()) }
function shiftDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return localIsoDate(d) }
function shiftMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return localIsoDate(d) }

describe('parseDateInput', () => {
  // ── Empty / null ────────────────────────────────────────────────────────
  it('returns empty string for empty/null/undefined input', () => {
    expect(parseDateInput('')).toBe('')
    expect(parseDateInput(null)).toBe('')
    expect(parseDateInput(undefined)).toBe('')
  })

  // ── ISO passthrough ─────────────────────────────────────────────────────
  it('passes through valid ISO dates unchanged', () => {
    expect(parseDateInput('2026-03-25')).toBe('2026-03-25')
    expect(parseDateInput('2000-01-01')).toBe('2000-01-01')
  })

  // ── Natural language keywords ───────────────────────────────────────────
  it('converts "today" / "сегодня" to today\'s ISO date', () => {
    const today = todayISO()
    expect(parseDateInput('today')).toBe(today)
    expect(parseDateInput('Today')).toBe(today)
    expect(parseDateInput('TODAY')).toBe(today)
    expect(parseDateInput('сегодня')).toBe(today)
    expect(parseDateInput('Сегодня')).toBe(today)
  })

  it('converts "tomorrow" / "завтра" to tomorrow\'s ISO date', () => {
    const tom = shiftDays(1)
    expect(parseDateInput('tomorrow')).toBe(tom)
    expect(parseDateInput('завтра')).toBe(tom)
  })

  it('converts "yesterday" / "вчера" to yesterday\'s ISO date', () => {
    const yest = shiftDays(-1)
    expect(parseDateInput('yesterday')).toBe(yest)
    expect(parseDateInput('вчера')).toBe(yest)
  })

  // ── Day-of-week (short EN) ─────────────────────────────────────────────
  it('parses short day-of-week names (EN) to next occurrence', () => {
    for (const [name, dow] of [['mon',1],['tue',2],['wed',3],['thu',4],['fri',5],['sat',6],['sun',0]]) {
      const result = parseDateInput(name)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const d = new Date(result + 'T12:00:00')
      expect(d.getDay()).toBe(dow)
      const diff = (d - new Date(todayISO() + 'T12:00:00')) / 86400000
      expect(diff).toBeGreaterThan(0)
      expect(diff).toBeLessThanOrEqual(7)
    }
  })

  // ── Day-of-week (short RU) ─────────────────────────────────────────────
  it('parses short day-of-week names (RU)', () => {
    for (const [name, dow] of [['пн',1],['вт',2],['ср',3],['чт',4],['пт',5],['сб',6],['вс',0]]) {
      const result = parseDateInput(name)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const d = new Date(result + 'T12:00:00')
      expect(d.getDay()).toBe(dow)
    }
  })

  // ── Day-of-week (full EN) ──────────────────────────────────────────────
  it('parses full day-of-week names (EN)', () => {
    for (const [name, dow] of [['monday',1],['tuesday',2],['wednesday',3],['thursday',4],['friday',5],['saturday',6],['sunday',0]]) {
      const result = parseDateInput(name)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(result + 'T12:00:00').getDay()).toBe(dow)
    }
  })

  // ── Day-of-week (full RU) ──────────────────────────────────────────────
  it('parses full day-of-week names (RU)', () => {
    for (const [name, dow] of [['понедельник',1],['вторник',2],['среда',3],['четверг',4],['пятница',5],['суббота',6],['воскресенье',0]]) {
      const result = parseDateInput(name)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(result + 'T12:00:00').getDay()).toBe(dow)
    }
  })

  // ── Relative dates ────────────────────────────────────────────────────
  it('parses +Nd as N days from today', () => {
    expect(parseDateInput('+1d')).toBe(shiftDays(1))
    expect(parseDateInput('+7d')).toBe(shiftDays(7))
    expect(parseDateInput('+30d')).toBe(shiftDays(30))
  })

  it('parses +Nw as N weeks from today', () => {
    expect(parseDateInput('+1w')).toBe(shiftDays(7))
    expect(parseDateInput('+2w')).toBe(shiftDays(14))
  })

  it('parses +Nm as N months from today', () => {
    expect(parseDateInput('+1m')).toBe(shiftMonths(1))
    expect(parseDateInput('+3m')).toBe(shiftMonths(3))
  })

  // ── Bare day number ───────────────────────────────────────────────────
  it('parses bare day number as day of current/next month', () => {
    const result = parseDateInput('15')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.endsWith('-15')).toBe(true)
    // Must be in the future
    expect(result >= todayISO()).toBe(true)
  })

  it('rejects bare numbers outside 1-31', () => {
    expect(parseDateInput('0')).toBeNull()
    expect(parseDateInput('32')).toBeNull()
  })

  // ── DD.MM and DD/MM (no year) ─────────────────────────────────────────
  it('parses DD.MM as next occurrence of that date', () => {
    const result = parseDateInput('25.12')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.slice(5)).toBe('12-25')
  })

  it('parses DD/MM as next occurrence of that date', () => {
    const result = parseDateInput('1/5')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.slice(5)).toBe('05-01')
  })

  // ── DD.MM.YYYY ────────────────────────────────────────────────────────
  it('parses DD.MM.YYYY and DD-MM-YYYY', () => {
    expect(parseDateInput('25.03.2026')).toBe('2026-03-25')
    expect(parseDateInput('25-03-2026')).toBe('2026-03-25')
  })

  // ── Month name + day combos ───────────────────────────────────────────
  it('parses "5jan" and "jan5" (EN)', () => {
    const r1 = parseDateInput('5jan')
    const r2 = parseDateInput('jan5')
    expect(r1).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r1).toBe(r2)
    expect(r1.slice(5)).toBe('01-05')
  })

  it('parses "15aug" (EN)', () => {
    const r = parseDateInput('15aug')
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.slice(5)).toBe('08-15')
  })

  it('parses "5янв" and "янв5" (RU)', () => {
    const r1 = parseDateInput('5янв')
    const r2 = parseDateInput('янв5')
    expect(r1).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r1).toBe(r2)
    expect(r1.slice(5)).toBe('01-05')
  })

  it('parses "20апр" (RU)', () => {
    const r = parseDateInput('20апр')
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.slice(5)).toBe('04-20')
  })

  // ── Rejection of invalid input ────────────────────────────────────────
  it('returns null for unparseable strings', () => {
    expect(parseDateInput('next week')).toBeNull()
    expect(parseDateInput('someday')).toBeNull()
    expect(parseDateInput('abc')).toBeNull()
    expect(parseDateInput('2026')).toBeNull()
    expect(parseDateInput('March 25')).toBeNull()
  })

  // ── REGRESSION: raw text must never pass as a date ────────────────────
  it('REGRESSION: natural language words always produce ISO format', () => {
    const result = parseDateInput('today')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).not.toBe('today')
  })
})
