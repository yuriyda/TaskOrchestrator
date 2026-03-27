// @vitest-environment node
/**
 * Tests for parseDateInput — the central date-string normalizer.
 *
 * The function lives inside task-orchestrator.jsx (not importable directly),
 * so we extract it from source and eval it in a clean scope.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const JSX_SRC = fs.readFileSync(path.resolve(__dirname, '../../task-orchestrator.jsx'), 'utf8')

let parseDateInput
let localIsoDate

beforeAll(() => {
  // Extract localIsoDate
  const lidMatch = JSX_SRC.match(/function localIsoDate\(d\)\s*\{([\s\S]*?)\n\}/)
  if (!lidMatch) throw new Error('localIsoDate not found in source')

  // Extract parseDateInput
  const pdiMatch = JSX_SRC.match(/function parseDateInput\(str\)\s*\{([\s\S]*?)\n\}/)
  if (!pdiMatch) throw new Error('parseDateInput not found in source')

  // Build both functions together so parseDateInput can call localIsoDate
  const combined = new Function('str',
    `function localIsoDate(d) {${lidMatch[1]}}\n` +
    pdiMatch[1]
  )
  parseDateInput = combined

  localIsoDate = new Function('d', lidMatch[1])
})

// Helper: today's ISO date in local timezone
function todayISO() { return localIsoDate(new Date()) }
function shiftDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return localIsoDate(d) }
function shiftMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return localIsoDate(d) }

describe('parseDateInput', () => {
  it('returns empty string for empty/null/undefined input', () => {
    expect(parseDateInput('')).toBe('')
    expect(parseDateInput(null)).toBe('')
    expect(parseDateInput(undefined)).toBe('')
  })

  it('passes through valid ISO dates unchanged', () => {
    expect(parseDateInput('2026-03-25')).toBe('2026-03-25')
    expect(parseDateInput('2000-01-01')).toBe('2000-01-01')
  })

  // ── Natural language (THE BUG: these used to be stored literally) ──────────

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

  // ── Relative dates ────────────────────────────────────────────────────────

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

  // ── Format variations ─────────────────────────────────────────────────────

  it('parses MM/DD/YYYY', () => {
    expect(parseDateInput('03/25/2026')).toBe('2026-03-25')
    expect(parseDateInput('1/5/2026')).toBe('2026-01-05')
  })

  it('parses DD.MM.YYYY and DD-MM-YYYY', () => {
    expect(parseDateInput('25.03.2026')).toBe('2026-03-25')
    expect(parseDateInput('25-03-2026')).toBe('2026-03-25')
  })

  // ── Rejection of invalid input ────────────────────────────────────────────

  it('returns null for unparseable strings', () => {
    expect(parseDateInput('next week')).toBeNull()
    expect(parseDateInput('someday')).toBeNull()
    expect(parseDateInput('abc')).toBeNull()
    expect(parseDateInput('2026')).toBeNull()
    expect(parseDateInput('March 25')).toBeNull()
  })

  // ── Critical regression test: raw text must NEVER pass as a date ──────────

  it('REGRESSION: natural language words always produce ISO format, never pass through raw', () => {
    const result = parseDateInput('today')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).not.toBe('today')
  })
})
