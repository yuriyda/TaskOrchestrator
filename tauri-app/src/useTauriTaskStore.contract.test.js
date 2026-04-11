/**
 * Contract tests for useTauriTaskStore — validates the public API surface.
 *
 * These tests parse the source code to verify that all expected exports,
 * return properties, and domain module contracts are preserved after refactoring.
 * Run BEFORE and AFTER refactoring to ensure no regression.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ── Source files ─────────────────────────────────────────────────────────────

const STORE_SRC = fs.readFileSync(path.resolve(__dirname, 'useTauriTaskStore.ts'), 'utf8')
const PLANNER_OPS_SRC = fs.readFileSync(path.resolve(__dirname, 'store/usePlannerOps.ts'), 'utf8')
const SYNC_OPS_SRC = fs.readFileSync(path.resolve(__dirname, 'store/useSyncOps.ts'), 'utf8')
const DB_OPS_SRC = fs.readFileSync(path.resolve(__dirname, 'store/useDbOps.ts'), 'utf8')
// Combined source: main hook + all sub-hooks (for aggregate checks)
const ALL_SRC = STORE_SRC + '\n' + PLANNER_OPS_SRC + '\n' + SYNC_OPS_SRC + '\n' + DB_OPS_SRC

// ── Expected API surface ─────────────────────────────────────────────────────

// The complete set of properties returned by useTauriTaskStore().
// If ANY property is removed or renamed, these tests MUST fail.
const EXPECTED_RETURN_KEYS = [
  // State
  'tasks', 'lists', 'tags', 'flows', 'flowMeta', 'personas',
  // Task CRUD + bulk
  'addTask', 'updateTask',
  'bulkStatus', 'bulkCycle', 'bulkDelete', 'bulkPriority', 'bulkDueShift', 'bulkSnooze', 'bulkAssignToday',
  // Flow meta
  'updateFlow', 'deleteFlow',
  // Import / demo / clear
  'importRtm', 'clearAll', 'loadDemoData',
  // Undo
  'undo', 'canUndo',
  // Meta
  'metaSettings', 'saveMeta',
  // DB maintenance
  'dbPath', 'revealDb', 'openNewDb', 'createNewDb', 'moveCurrentDb',
  // Backup
  'createBackup', 'listBackups', 'restoreBackup',
  // Sync
  'exportSync', 'importSync', 'exportSyncRequest', 'handleSyncRequest', 'importSyncClipboard',
  'getSyncLog', 'getSyncStats', 'clearSyncData',
  // Google Drive
  'gdriveCheckConnection', 'gdriveConnectAccount', 'gdriveDisconnectAccount',
  'gdriveSyncNow', 'gdriveGetConfig', 'gdriveCheckSyncFile', 'gdrivePurgeSyncFile', 'gdriveReadSyncFile',
  // Utility
  'openUrl',
  // Day Planner
  'dayPlanSlots', 'currentPlan', 'plannedTaskIds',
  'plannerLoadDay', 'plannerRefreshSlots',
  'plannerAddTaskSlot', 'plannerAddBlockedSlot',
  'plannerMoveSlot', 'plannerResizeSlot', 'plannerRemoveSlot',
  'plannerUpdateSlotTitle', 'plannerUpdateSlotRecurrence', 'plannerUpdateHours',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract property names from the final return { ... } block of useTauriTaskStore.
 *  Handles: shorthand keys, key:value, ...spread, planner.key patterns. */
function extractReturnKeys(src, spreadSources = {}) {
  const m = src.match(/return\s*\{\s*\n\s*tasks,\s*lists,([\s\S]*?)\n\s*\}/)
  if (!m) throw new Error('Final return block not found (expected "return { tasks, lists, ...")')
  const block = 'tasks, lists,' + m[1]
  const keys = []
  const cleaned = block.replace(/\/\/[^\n]*/g, '').replace(/\n/g, ' ')
  for (const entry of cleaned.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    // Spread: ...syncOps → resolve from spread source return block
    const spreadMatch = trimmed.match(/^\.\.\.(\w+)/)
    if (spreadMatch && spreadSources[spreadMatch[1]]) {
      keys.push(...spreadSources[spreadMatch[1]])
      continue
    }
    // "key: planner.plannerX" → extract the left-hand key
    const km = trimmed.match(/^(\w+)/)
    if (km) keys.push(km[1])
  }
  return [...new Set(keys)]
}

/** Extract return keys from a sub-hook's final return { ... } block.
 *  Finds the LAST return { } in the file (the sub-hook's public API). */
function extractSubHookReturnKeys(src) {
  // Find all return { ... } blocks; take the last one (the function's final return)
  const allReturns = [...src.matchAll(/return\s*\{([^{}]*)\}/g)]
  if (allReturns.length === 0) return []
  const lastReturn = allReturns[allReturns.length - 1][1]
  const keys = []
  const cleaned = lastReturn.replace(/\/\/[^\n]*/g, '').replace(/\n/g, ' ')
  for (const entry of cleaned.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const km = trimmed.match(/^(\w+)/)
    // Skip internal setters (setDayPlanSlots, setPlannedTaskIds) — not part of public API
    if (km && !km[1].startsWith('set') && !km[1].startsWith('refresh')) keys.push(km[1])
  }
  return keys
}

/** Count useCallback definitions in source */
function countUseCallbacks(src) {
  return (src.match(/useCallback\(/g) || []).length
}

/** Count useState definitions in source */
function countUseStates(src) {
  return (src.match(/useState\(/g) || []).length
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTauriTaskStore API contract', () => {
  // Resolve spread operators: ...syncOps expands to sync sub-hook's return keys
  const syncReturnKeys = extractSubHookReturnKeys(SYNC_OPS_SRC)
  const returnKeys = extractReturnKeys(STORE_SRC, { syncOps: syncReturnKeys })

  it('returns all expected properties (no missing)', () => {
    const missing = EXPECTED_RETURN_KEYS.filter(k => !returnKeys.includes(k))
    expect(missing, `Missing keys from return: ${missing.join(', ')}`).toEqual([])
  })

  it('returns no unexpected properties (no extras)', () => {
    const extra = returnKeys.filter(k => !EXPECTED_RETURN_KEYS.includes(k))
    expect(extra, `Unexpected extra keys: ${extra.join(', ')}`).toEqual([])
  })

  it('has exactly 48 return properties', () => {
    expect(returnKeys.length).toBe(EXPECTED_RETURN_KEYS.length)
  })
})

describe('useTauriTaskStore internal structure', () => {
  it('uses useCallback for mutation functions (main + sub-hooks)', () => {
    const count = countUseCallbacks(ALL_SRC)
    // Should have at least 30 useCallbacks across all store modules
    expect(count).toBeGreaterThanOrEqual(30)
  })

  it('exports useTauriTaskStore as named export', () => {
    expect(STORE_SRC).toContain('export function useTauriTaskStore()')
  })

  it('uses HISTORY_LIMIT constant for undo history', () => {
    expect(STORE_SRC).toContain('HISTORY_LIMIT')
    expect(STORE_SRC).not.toContain('.slice(-5)')
  })

  it('uses fetchAll for full task refresh', () => {
    expect(STORE_SRC).toContain('fetchAll(db)')
  })

  it('uses logChange for sync log writes', () => {
    const logChangeCalls = (STORE_SRC.match(/logChange\(/g) || []).length
    expect(logChangeCalls).toBeGreaterThanOrEqual(15)
  })
})

describe('Domain sections present (main + sub-hooks)', () => {
  it('has Day Planner section in usePlannerOps', () => {
    expect(PLANNER_OPS_SRC).toContain('plannerLoadDay')
    expect(PLANNER_OPS_SRC).toContain('plannerAddTaskSlot')
    expect(PLANNER_OPS_SRC).toContain('plannerRemoveSlot')
    expect(PLANNER_OPS_SRC).toContain('dayPlanSlots')
  })

  it('has Sync section in useSyncOps', () => {
    expect(SYNC_OPS_SRC).toContain('exportSync')
    expect(SYNC_OPS_SRC).toContain('importSync')
    expect(SYNC_OPS_SRC).toContain('exportSyncRequest')
    expect(SYNC_OPS_SRC).toContain('importSyncClipboard')
  })

  it('has Google Drive section in useSyncOps', () => {
    expect(SYNC_OPS_SRC).toContain('gdriveCheckConnection')
    expect(SYNC_OPS_SRC).toContain('gdriveSyncNow')
    expect(SYNC_OPS_SRC).toContain('gdriveGetConfig')
  })

  it('has Backup section in useDbOps', () => {
    expect(DB_OPS_SRC).toContain('createBackup')
    expect(DB_OPS_SRC).toContain('listBackups')
    expect(DB_OPS_SRC).toContain('restoreBackup')
  })

  it('has DB maintenance section in useDbOps', () => {
    expect(DB_OPS_SRC).toContain('openNewDb')
    expect(DB_OPS_SRC).toContain('createNewDb')
    expect(DB_OPS_SRC).toContain('moveCurrentDb')
    expect(DB_OPS_SRC).toContain('_closeDb')
  })

  it('has Undo section', () => {
    expect(STORE_SRC).toContain('const undo')
    expect(STORE_SRC).toContain('setHistory')
  })

  it('has Clear All section', () => {
    expect(STORE_SRC).toContain('const clearAll')
  })

  it('has RTM Import section', () => {
    expect(STORE_SRC).toContain('const importRtm')
  })

  it('has Flow meta section', () => {
    expect(STORE_SRC).toContain('const updateFlow')
    expect(STORE_SRC).toContain('const deleteFlow')
  })
})
