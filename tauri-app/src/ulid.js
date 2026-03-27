// ─── ULID generator (Universally Unique Lexicographically Sortable Identifier) ─
// 48-bit timestamp (ms) + 80-bit random, encoded as Crockford Base32, 26 chars.
// Monotonic: within the same millisecond, the random part is incremented.
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford Base32
let _lastTime = 0
let _lastRandom = new Array(16).fill(0) // 80 bits = 16 × 5-bit digits

export function ulid() {
  const now = Date.now()
  if (now === _lastTime) {
    // Increment random part (carry propagation)
    for (let i = 15; i >= 0; i--) {
      if (_lastRandom[i] < 31) { _lastRandom[i]++; break }
      _lastRandom[i] = 0 // carry
    }
  } else {
    _lastTime = now
    for (let i = 0; i < 16; i++) _lastRandom[i] = (Math.random() * 32) | 0
  }
  // Encode timestamp (10 chars, most significant first)
  let t = now
  const time = new Array(10)
  for (let i = 9; i >= 0; i--) { time[i] = ENCODING[t & 31]; t = Math.floor(t / 32) }
  // Encode random (16 chars)
  const rand = _lastRandom.map(v => ENCODING[v]).join('')
  return time.join('') + rand
}
