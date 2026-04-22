/**
 * Schema consistency tests for useTauriTaskStore.
 *
 * Tests verify that:
 * 1. safeIsoDate correctly validates date strings
 * 2. taskToRow applies safeIsoDate to date fields
 * 3. TASK_COLUMNS, rowToTask, taskToRow, and schema migrations are consistent
 * 4. Sync preparation fields (v6) are properly included
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { safeIsoDate } from './core/date.js'
import { TASK_COLUMNS, TASK_INSERT, TASK_INSERT_IGN, rowToTask, taskToRow, parseDependsOn } from './store/helpers.js'
import { VERSIONED_MIGRATIONS, LATEST_SCHEMA_VERSION } from './store/migrations.js'

// Read source files for schema consistency checks
const HELPERS_SRC = fs.readFileSync(path.resolve(__dirname, 'store/helpers.ts'), 'utf8')
const MIGRATIONS_SRC = fs.readFileSync(path.resolve(__dirname, 'store/migrations.ts'), 'utf8')
const STORE_SRC = fs.readFileSync(path.resolve(__dirname, 'useTauriTaskStore.ts'), 'utf8')

// ── Extract schema columns from migrations source ───────────────────────────

function extractSchemaColumns() {
  const cols = []
  // v1 CREATE TABLE
  const create = MIGRATIONS_SRC.match(/CREATE TABLE IF NOT EXISTS tasks\s*\(([\s\S]*?)\)/)
  if (create) {
    for (const line of create[1].split('\n')) {
      const cm = line.trim().match(/^(\w+)\s+(TEXT|INTEGER)/)
      if (cm) cols.push(cm[1])
    }
  }
  // ALTER TABLE ADD COLUMN
  for (const am of MIGRATIONS_SRC.matchAll(/ALTER TABLE tasks ADD COLUMN\s+(\w+)/g)) {
    cols.push(am[1])
  }
  return cols
}

// ── Extract rowToTask() mapped DB columns from helpers source ────────────────

function extractRowToTaskColumns() {
  const m = HELPERS_SRC.match(/export function rowToTask\(row[\s\S]*?\{([\s\S]*?)\n\}/)
  if (!m) throw new Error('rowToTask not found in helpers source')
  return [...new Set([...m[1].matchAll(/row\.(\w+)/g)].map(x => x[1]))]
}

// ── Count taskToRow fields from helpers source ──────────────────────────────

function countTaskToRowFields() {
  const m = HELPERS_SRC.match(/export function taskToRow\(task[^)]*\)[^{]*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
  if (!m) throw new Error('taskToRow not found in helpers source')
  const lines = m[1].split('\n').map(l => l.trim()).filter(l => l && (l.includes('task.') || l.includes('safeIsoDate(')))
  return lines.length
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseDependsOn (tolerant legacy parser)', () => {
  it('returns null for empty/null/undefined raw', () => {
    expect(parseDependsOn(null)).toBeNull()
    expect(parseDependsOn('')).toBeNull()
  })
  it('parses a JSON array', () => {
    expect(parseDependsOn('["id1","id2"]')).toEqual(['id1', 'id2'])
  })
  it('returns null for a JSON empty array', () => {
    expect(parseDependsOn('[]')).toBeNull()
  })
  it('wraps a raw non-JSON legacy string into a single-element array', () => {
    expect(parseDependsOn('legacy-task-id')).toEqual(['legacy-task-id'])
  })
  it('wraps a JSON-encoded string into a single-element array', () => {
    expect(parseDependsOn('"single-id"')).toEqual(['single-id'])
  })
  it('returns null for JSON objects or numbers (unsupported shapes)', () => {
    expect(parseDependsOn('{"a":1}')).toBeNull()
    expect(parseDependsOn('42')).toBeNull()
  })
})

describe('safeIsoDate (DB-layer date guard)', () => {
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
    expect(safeIsoDate('2026-3-25')).toBeNull()
    expect(safeIsoDate('2026/03/25')).toBeNull()
    expect(safeIsoDate('25-03-2026')).toBeNull()
    expect(safeIsoDate('03/25/2026')).toBeNull()
    expect(safeIsoDate('2026-03-25T12:00')).toBeNull()
  })
})

describe('taskToRow applies safeIsoDate to date fields', () => {
  it('due and dateStart with non-ISO values are nullified in taskToRow output', () => {
    const m = HELPERS_SRC.match(/export function taskToRow\(task[^)]*\)[^{]*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
    const body = m[1]
    expect(body).toContain('safeIsoDate(task.due)')
    expect(body).toContain('safeIsoDate(task.dateStart)')
  })
})

describe('Sync preparation fields (v6)', () => {
  it('TASK_COLUMNS includes sync fields', () => {
    expect(TASK_COLUMNS).toContain('updated_at')
    expect(TASK_COLUMNS).toContain('deleted_at')
    expect(TASK_COLUMNS).toContain('device_id')
  })

  it('rowToTask reads sync fields', () => {
    const mapped = extractRowToTaskColumns()
    expect(mapped).toContain('updated_at')
    expect(mapped).toContain('deleted_at')
    expect(mapped).toContain('device_id')
  })

  it('taskToRow includes sync fields', () => {
    const m = HELPERS_SRC.match(/export function taskToRow\(task[^)]*\)[^{]*\{[\s\S]*?return\s*\[([\s\S]*?)\]\s*\}/)
    const body = m[1]
    expect(body).toContain('task.updatedAt')
    expect(body).toContain('task.deletedAt')
    expect(body).toContain('task.deviceId')
  })

  it('sync_log table is defined in migrations', () => {
    expect(MIGRATIONS_SRC).toContain('CREATE TABLE IF NOT EXISTS sync_log')
    expect(MIGRATIONS_SRC).toContain('idx_sync_log_lamport')
    expect(MIGRATIONS_SRC).toContain('idx_sync_log_entity')
  })

  it('touchUpdatedAt helper exists', () => {
    expect(HELPERS_SRC).toContain('async function touchUpdatedAt')
  })
})

describe('Schema consistency', () => {
  const schemaColumns = extractSchemaColumns()

  it('TASK_COLUMNS count matches taskToRow() fields count', () => {
    const toRowCount = countTaskToRowFields()
    expect(toRowCount).toBe(TASK_COLUMNS.length)
  })

  it('TASK_COLUMNS contains all columns from schema (CREATE + ALTER)', () => {
    const missing = schemaColumns.filter(c => !TASK_COLUMNS.includes(c))
    expect(missing).toEqual([])
  })

  it('schema columns are all present in TASK_COLUMNS (no extras in schema)', () => {
    const extra = TASK_COLUMNS.filter(c => !schemaColumns.includes(c))
    expect(extra).toEqual([])
  })

  it('rowToTask() references all DB columns from TASK_COLUMNS', () => {
    const mapped = extractRowToTaskColumns()
    const missing = TASK_COLUMNS.filter(col => !mapped.includes(col))
    expect(missing).toEqual([])
  })
})

describe('Migration loop coverage', () => {
  it('VERSIONED_MIGRATIONS has entries for every version from 2 to LATEST_SCHEMA_VERSION', () => {
    for (let v = 2; v <= LATEST_SCHEMA_VERSION; v++) {
      expect(VERSIONED_MIGRATIONS[v], `Missing migration for v${v}`).toBeDefined()
      expect(Array.isArray(VERSIONED_MIGRATIONS[v]), `v${v} should be an array`).toBe(true)
      expect(VERSIONED_MIGRATIONS[v].length, `v${v} should have at least one statement`).toBeGreaterThan(0)
    }
  })

  it('VERSIONED_MIGRATIONS has no entries beyond LATEST_SCHEMA_VERSION', () => {
    const keys = Object.keys(VERSIONED_MIGRATIONS).map(Number)
    const outOfRange = keys.filter(k => k > LATEST_SCHEMA_VERSION || k < 2)
    expect(outOfRange).toEqual([])
  })

  it('openDb migration loop in source matches VERSIONED_MIGRATIONS pattern', () => {
    // Verify the loop-based approach is present (not the old if-block pattern)
    expect(STORE_SRC).toContain('for (let v = 2; v <= LATEST_SCHEMA_VERSION; v++)')
    expect(STORE_SRC).toContain('VERSIONED_MIGRATIONS[v]')
    // Old pattern should NOT be present
    expect(STORE_SRC).not.toContain('MIGRATIONS_V2')
    expect(STORE_SRC).not.toContain('MIGRATIONS_V3')
  })
})
