/**
 * @file perfMeter.ts
 * @description Lightweight in-session perf counter for hot paths.
 *
 * Task 5 phase C: we want to know how `fetchAll` behaves on real data before
 * deciding whether to rewrite mutations to emit deltas. This module keeps a
 * cheap map of counters (count, total, last, max) and exposes them for a
 * future Settings > Diagnostics panel or ad-hoc `getPerfStats()` in console.
 *
 * It uses `performance.now()` when available (browser/Node modern), else
 * `Date.now()`. Never throws — instrumentation must not break the caller.
 */

export interface PerfSample {
  count: number
  totalMs: number
  lastMs: number
  maxMs: number
}

const stats: Map<string, PerfSample> = new Map()
const gauges: Map<string, number> = new Map()

function now(): number {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  } catch { /* ignore */ }
  return Date.now()
}

export async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = now()
  try {
    return await fn()
  } finally {
    const dt = now() - t0
    const prev = stats.get(label) || { count: 0, totalMs: 0, lastMs: 0, maxMs: 0 }
    stats.set(label, {
      count: prev.count + 1,
      totalMs: prev.totalMs + dt,
      lastMs: dt,
      maxMs: dt > prev.maxMs ? dt : prev.maxMs,
    })
  }
}

export function getPerfStats(): Record<string, PerfSample> {
  const out: Record<string, PerfSample> = {}
  for (const [k, v] of stats) out[k] = { ...v }
  return out
}

// Point-in-time numeric reading (e.g. "tasks.count") — most-recent value only,
// no history. Useful for correlating fetchAll duration with dataset size in
// the Diagnostics panel.
export function setPerfGauge(label: string, value: number): void {
  gauges.set(label, value)
}

export function getPerfGauges(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of gauges) out[k] = v
  return out
}

export function resetPerfStats(label?: string): void {
  if (label) stats.delete(label)
  else stats.clear()
}

// Expose on window for dev-time inspection ("what's the fetchAll cost?")
// without requiring a full Diagnostics panel. Harmless in tests.
try {
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__perfStats = getPerfStats
    ;(globalThis as any).__perfGauges = getPerfGauges
  }
} catch { /* ignore */ }
