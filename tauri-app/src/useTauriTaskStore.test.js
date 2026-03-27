/**
 * Schema consistency tests for useTauriTaskStore.
 *
 * These tests read the store source file and verify that:
 * 1. TASK_COLUMNS length matches taskToRow() return array length
 * 2. All schema columns (v1 CREATE + ALTER migrations) are listed in TASK_COLUMNS
 * 3. rowToTask() covers every column from TASK_COLUMNS (nothing silently dropped)
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SRC = fs.readFileSync(path.resolve(__dirname, 'useTauriTaskStore.js'), 'utf8')

// ── Extract TASK_COLUMNS from source ─────────────────────────────────────────

function extractTaskColumns() {
  const m = SRC.match(/const TASK_COLUMNS\s*=\s*\[([\s\S]*?)\]/)
  if (!m) throw new Error('TASK_COLUMNS not found in source')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

// ── Extract taskToRow() return array length ──────────────────────────────────

function countTaskToRowFields() {
  const m = SRC.match(/function taskToRow\(task\)\s*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
  if (!m) throw new Error('taskToRow not found in source')
  // Count entries: each non-empty line containing "task." or "safeIsoDate(" is one field
  const lines = m[1].split('\n').map(l => l.trim()).filter(l => l && (l.includes('task.') || l.includes('safeIsoDate(')))
  return lines.length
}

// ── Extract CREATE TABLE + ALTER TABLE columns ───────────────────────────────

function extractSchemaColumns() {
  const cols = []
  // v1 CREATE TABLE
  const create = SRC.match(/CREATE TABLE IF NOT EXISTS tasks\s*\(([\s\S]*?)\)/)
  if (create) {
    for (const line of create[1].split('\n')) {
      const cm = line.trim().match(/^(\w+)\s+(TEXT|INTEGER)/)
      if (cm) cols.push(cm[1])
    }
  }
  // ALTER TABLE ADD COLUMN
  for (const am of SRC.matchAll(/ALTER TABLE tasks ADD COLUMN\s+(\w+)/g)) {
    cols.push(am[1])
  }
  return cols
}

// ── Extract rowToTask() mapped DB columns ────────────────────────────────────

function extractRowToTaskColumns() {
  // Search entire rowToTask function body (including sanitize lines before return)
  const m = SRC.match(/function rowToTask\(row[\s\S]*?\{([\s\S]*?)\n\}/)
  if (!m) throw new Error('rowToTask not found in source')
  // Find all row.xxx references in the full function body
  return [...new Set([...m[1].matchAll(/row\.(\w+)/g)].map(x => x[1]))]
}

// ── Extract safeIsoDate function to test it directly ─────────────────────────

function extractSafeIsoDate() {
  const m = SRC.match(/const ISO_DATE_RE\s*=\s*(\/[^/]+\/)\s*\nfunction safeIsoDate\(v\)\s*\{([\s\S]*?)\n\}/)
  if (!m) throw new Error('safeIsoDate not found in source')
  // Reconstruct the function in a safe scope
  const fn = new Function('v', `const ISO_DATE_RE = ${m[1]}; ${m[2].replace('console.warn', '// ')}`)
  return fn
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('safeIsoDate (DB-layer date guard)', () => {
  const safeIsoDate = extractSafeIsoDate()

  it('passes valid ISO dates through', () => {
    expect(safeIsoDate('2026-03-25')).toBe('2026-03-25')
    expect(safeIsoDate('2000-01-01')).toBe('2000-01-01')
    expect(safeIsoDate('2099-12-31')).toBe('2099-12-31')
  })

  it('returns null for null/undefined/empty', () => {
    expect(safeIsoDate(null)).toBeNull()
    expect(safeIsoDate(undefined)).toBeNull()
    expect(safeIsoDate('')).toBeNull()
  })

  it('rejects non-ISO strings (the original bug: "today" stored literally)', () => {
    expect(safeIsoDate('today')).toBeNull()
    expect(safeIsoDate('tomorrow')).toBeNull()
    expect(safeIsoDate('сегодня')).toBeNull()
    expect(safeIsoDate('завтра')).toBeNull()
    expect(safeIsoDate('+3d')).toBeNull()
    expect(safeIsoDate('next week')).toBeNull()
  })

  it('rejects partial or malformed dates', () => {
    expect(safeIsoDate('2026-3-25')).toBeNull()    // single-digit month
    expect(safeIsoDate('2026/03/25')).toBeNull()    // wrong separator
    expect(safeIsoDate('25-03-2026')).toBeNull()    // DD-MM-YYYY
    expect(safeIsoDate('03/25/2026')).toBeNull()    // MM/DD/YYYY
    expect(safeIsoDate('2026-03-25T12:00')).toBeNull() // datetime
  })
})

describe('taskToRow applies safeIsoDate to date fields', () => {
  it('due and dateStart with non-ISO values are nullified in taskToRow output', () => {
    const m = SRC.match(/function taskToRow\(task\)\s*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
    const body = m[1]
    // Verify safeIsoDate is applied to due and dateStart
    expect(body).toContain('safeIsoDate(task.due)')
    expect(body).toContain('safeIsoDate(task.dateStart)')
  })
})

describe('Sync preparation fields (v6)', () => {
  it('TASK_COLUMNS includes sync fields', () => {
    const cols = extractTaskColumns()
    expect(cols).toContain('updated_at')
    expect(cols).toContain('deleted_at')
    expect(cols).toContain('device_id')
  })

  it('rowToTask reads sync fields', () => {
    const mapped = extractRowToTaskColumns()
    expect(mapped).toContain('updated_at')
    expect(mapped).toContain('deleted_at')
    expect(mapped).toContain('device_id')
  })

  it('taskToRow includes sync fields', () => {
    const m = SRC.match(/function taskToRow\(task\)\s*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
    const body = m[1]
    expect(body).toContain('task.updatedAt')
    expect(body).toContain('task.deletedAt')
    expect(body).toContain('task.deviceId')
  })

  it('sync_log table is defined in migrations', () => {
    expect(SRC).toContain('CREATE TABLE IF NOT EXISTS sync_log')
    expect(SRC).toContain('idx_sync_log_timestamp')
    expect(SRC).toContain('idx_sync_log_entity')
  })

  it('touchUpdatedAt helper exists', () => {
    expect(SRC).toContain('async function touchUpdatedAt')
  })
})

describe('Schema consistency', () => {
  const taskColumns = extractTaskColumns()
  const schemaColumns = extractSchemaColumns()

  it('TASK_COLUMNS count matches taskToRow() fields count', () => {
    const toRowCount = countTaskToRowFields()
    expect(toRowCount).toBe(taskColumns.length)
  })

  it('TASK_COLUMNS contains all columns from schema (CREATE + ALTER)', () => {
    const missing = schemaColumns.filter(c => !taskColumns.includes(c))
    expect(missing).toEqual([])
  })

  it('schema columns are all present in TASK_COLUMNS (no extras in schema)', () => {
    const extra = taskColumns.filter(c => !schemaColumns.includes(c))
    expect(extra).toEqual([])
  })

  it('rowToTask() references all DB columns from TASK_COLUMNS', () => {
    const mapped = extractRowToTaskColumns()
    // Some columns have aliases (list_name -> list_name, flow_id -> flow_id, etc.)
    // We check that every TASK_COLUMN is referenced somewhere in rowToTask
    const missing = taskColumns.filter(col => !mapped.includes(col))
    expect(missing).toEqual([])
  })
})
