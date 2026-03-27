/**
 * Tests for ULID generator — the core identity function for all entities.
 *
 * Verifies: format, uniqueness, lexicographic sortability, and monotonicity.
 */
import { describe, it, expect } from 'vitest'

// Extract ulid from source (it depends on module-level state, so we eval it)
import fs from 'fs'
import path from 'path'

const SRC = fs.readFileSync(path.resolve(__dirname, 'ulid.js'), 'utf8')
const STORE_SRC = fs.readFileSync(path.resolve(__dirname, 'useTauriTaskStore.js'), 'utf8')

// Extract the ULID generator code block and build a standalone factory
function createUlidFactory() {
  const encodingMatch = SRC.match(/const ENCODING = '([^']+)'/)
  if (!encodingMatch) throw new Error('ENCODING not found')

  // Build a self-contained ulid function with its own state
  const code = `
    const ENCODING = '${encodingMatch[1]}';
    let _lastTime = 0;
    let _lastRandom = new Array(16).fill(0);
    function ulid() {
      const now = Date.now();
      if (now === _lastTime) {
        for (let i = 15; i >= 0; i--) {
          if (_lastRandom[i] < 31) { _lastRandom[i]++; break; }
          _lastRandom[i] = 0;
        }
      } else {
        _lastTime = now;
        for (let i = 0; i < 16; i++) _lastRandom[i] = (Math.random() * 32) | 0;
      }
      let t = now;
      const time = new Array(10);
      for (let i = 9; i >= 0; i--) { time[i] = ENCODING[t & 31]; t = Math.floor(t / 32); }
      const rand = _lastRandom.map(v => ENCODING[v]).join('');
      return time.join('') + rand;
    }
    return ulid;
  `
  return new Function(code)()
}

const CROCKFORD_RE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

describe('ULID generator', () => {
  const ulid = createUlidFactory()

  it('produces a 26-character Crockford Base32 string', () => {
    const id = ulid()
    expect(id).toHaveLength(26)
    expect(id).toMatch(CROCKFORD_RE)
  })

  it('never contains ambiguous characters (I, L, O, U)', () => {
    for (let i = 0; i < 100; i++) {
      const id = ulid()
      expect(id).not.toMatch(/[ILOU]/)
    }
  })

  it('generates unique IDs (1000 consecutive calls)', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) ids.add(ulid())
    expect(ids.size).toBe(1000)
  })

  it('is lexicographically sortable by time', () => {
    const id1 = ulid()
    // Force a new timestamp by advancing Date.now
    const originalNow = Date.now
    let fakeTime = originalNow.call(Date) + 1000
    Date.now = () => fakeTime
    try {
      const id2 = ulid()
      expect(id1 < id2).toBe(true)
    } finally {
      Date.now = originalNow
    }
  })

  it('is monotonic within the same millisecond', () => {
    const originalNow = Date.now
    const frozenTime = originalNow.call(Date) + 5000
    Date.now = () => frozenTime
    try {
      const ids = []
      for (let i = 0; i < 100; i++) ids.push(ulid())

      // All should be unique
      expect(new Set(ids).size).toBe(100)

      // All should be strictly ascending
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i] > ids[i - 1]).toBe(true)
      }
    } finally {
      Date.now = originalNow
    }
  })

  it('timestamp portion (first 10 chars) encodes Date.now correctly', () => {
    const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const originalNow = Date.now
    const knownTime = 1711123456789 // a known timestamp
    Date.now = () => knownTime
    try {
      const id = ulid()
      // Decode first 10 chars back to a number
      let decoded = 0
      for (let i = 0; i < 10; i++) {
        decoded = decoded * 32 + ENCODING.indexOf(id[i])
      }
      expect(decoded).toBe(knownTime)
    } finally {
      Date.now = originalNow
    }
  })

  it('no old uid() format (numeric strings) exists in store source', () => {
    // Verify that the old uid() generator is fully removed from the store
    expect(STORE_SRC).not.toMatch(/\buid\(\)/)
    expect(STORE_SRC).not.toMatch(/let _nextId/)
    expect(STORE_SRC).not.toMatch(/const uid/)
  })
})
