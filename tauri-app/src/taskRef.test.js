// Task references (to:XXXXX) — normalization and unique-suffix generation.
import { describe, it, expect } from 'vitest'
import { normalizeTaskRef, taskRefSuffix, formatTaskRef } from '../../shared/core/taskRef.js'

describe('normalizeTaskRef', () => {
  it('strips the to: prefix and uppercases', () => {
    expect(normalizeTaskRef('to:7k3mz')).toBe('7K3MZ')
    expect(normalizeTaskRef('TO:7K3MZ')).toBe('7K3MZ')
    expect(normalizeTaskRef('7K3MZ')).toBe('7K3MZ')
    expect(normalizeTaskRef('  to:7k3mz  ')).toBe('7K3MZ')
  })
  it('applies Crockford forgiveness (O→0, I/L→1)', () => {
    expect(normalizeTaskRef('to:7kOmz')).toBe('7K0MZ')
    expect(normalizeTaskRef('to:7kimz')).toBe('7K1MZ')
    expect(normalizeTaskRef('to:7klmz')).toBe('7K1MZ')
  })
  it('accepts a full 26-char ULID', () => {
    const id = '01JF8A3T9GXK2M4N7P8Q9R0S1T'
    expect(normalizeTaskRef(id.toLowerCase())).toBe(id)
  })
  it('rejects non-reference input', () => {
    expect(normalizeTaskRef('abc')).toBe(null)              // too short
    expect(normalizeTaskRef('NO-SUCH-ID')).toBe(null)       // invalid chars
    expect(normalizeTaskRef('to:')).toBe(null)
    expect(normalizeTaskRef('')).toBe(null)
    expect(normalizeTaskRef('7KUMZ')).toBe(null)            // U not in Crockford
    expect(normalizeTaskRef('X'.repeat(27))).toBe(null)     // longer than a ULID
  })
})

describe('taskRefSuffix', () => {
  const id = '01JF8A3T9GXK2M4N7P8Q9R0S1T'
  it('returns a 5-char suffix when unique', () => {
    expect(taskRefSuffix(id, [id, '01JF8A3T9GXK2M4N7P8QAAAAA'])).toBe('9R0S1T'.slice(-5))
  })
  it('lengthens dynamically until unique', () => {
    const near = '01JF8A3T9GXK2M4N7P8QXR0S1T' // shares the last 5 chars, differs at -6
    expect(taskRefSuffix(id, [id, near])).toBe(id.slice(-6))
  })
  it('falls back to the full id when everything collides', () => {
    const twin = 'X' + id.slice(1) // differs only in the first char
    expect(taskRefSuffix(id, [id, twin])).toBe(id)
  })
  it('ignores the task itself in the collision check', () => {
    expect(taskRefSuffix(id, [id])).toBe(id.slice(-5))
    expect(taskRefSuffix(id, [])).toBe(id.slice(-5))
  })
})

describe('formatTaskRef', () => {
  it('round-trips through normalizeTaskRef', () => {
    const id = '01JF8A3T9GXK2M4N7P8Q9R0S1T'
    const ref = formatTaskRef(id, [id])
    expect(ref).toBe('to:' + id.slice(-5))
    expect(id.endsWith(normalizeTaskRef(ref))).toBe(true)
  })
})
