// @vitest-environment node
/**
 * Sync log integration tests.
 *
 * Verifies that logChange and nextLamport correctly populate sync_log
 * and vector_clock tables using an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { logChange, nextLamport } from './store/helpers.js'

// Adapter: make better-sqlite3 look like Tauri's db.execute/db.select
function wrapDb(betterDb) {
  return {
    execute(sql, params = []) {
      return betterDb.prepare(sql).run(...params)
    },
    select(sql, params = []) {
      return betterDb.prepare(sql).all(...params)
    },
  }
}

const DEVICE_ID = 'TEST_DEVICE_001'

describe('Sync log (logChange + nextLamport)', () => {
  let raw, db

  beforeEach(() => {
    raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE vector_clock (
        device_id TEXT PRIMARY KEY,
        counter   INTEGER NOT NULL DEFAULT 0
      )
    `)
    raw.exec(`
      CREATE TABLE sync_log (
        id         TEXT PRIMARY KEY,
        entity     TEXT NOT NULL,
        entity_id  TEXT NOT NULL,
        action     TEXT NOT NULL,
        lamport_ts INTEGER NOT NULL,
        device_id  TEXT NOT NULL,
        data       TEXT
      )
    `)
    raw.exec(`INSERT INTO vector_clock VALUES ('${DEVICE_ID}', 0)`)
    db = wrapDb(raw)
  })

  it('nextLamport increments counter monotonically', async () => {
    const ts1 = await nextLamport(db, DEVICE_ID)
    const ts2 = await nextLamport(db, DEVICE_ID)
    const ts3 = await nextLamport(db, DEVICE_ID)
    expect(ts1).toBe(1)
    expect(ts2).toBe(2)
    expect(ts3).toBe(3)
  })

  it('nextLamport updates vector_clock table', async () => {
    await nextLamport(db, DEVICE_ID)
    await nextLamport(db, DEVICE_ID)
    const [row] = db.select('SELECT counter FROM vector_clock WHERE device_id = ?', [DEVICE_ID])
    expect(row.counter).toBe(2)
  })

  it('logChange writes insert record with data snapshot', async () => {
    const lts = await nextLamport(db, DEVICE_ID)
    const taskData = { id: 'task_1', title: 'Buy milk', status: 'inbox' }
    await logChange(db, 'tasks', 'task_1', 'insert', taskData, lts, DEVICE_ID)

    const rows = db.select('SELECT * FROM sync_log')
    expect(rows).toHaveLength(1)
    expect(rows[0].entity).toBe('tasks')
    expect(rows[0].entity_id).toBe('task_1')
    expect(rows[0].action).toBe('insert')
    expect(rows[0].lamport_ts).toBe(1)
    expect(rows[0].device_id).toBe(DEVICE_ID)
    expect(JSON.parse(rows[0].data)).toEqual(taskData)
    expect(rows[0].id).toHaveLength(26) // ULID
  })

  it('logChange writes update record with changed fields', async () => {
    const lts = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 'task_1', 'update', { status: 'done' }, lts, DEVICE_ID)

    const [row] = db.select('SELECT * FROM sync_log')
    expect(row.action).toBe('update')
    expect(JSON.parse(row.data)).toEqual({ status: 'done' })
  })

  it('logChange writes delete record with null data', async () => {
    const lts = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 'task_1', 'delete', null, lts, DEVICE_ID)

    const [row] = db.select('SELECT * FROM sync_log')
    expect(row.action).toBe('delete')
    expect(row.data).toBeNull()
  })

  it('multiple changes produce monotonically increasing lamport_ts', async () => {
    const lts1 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 't1', 'insert', { title: 'A' }, lts1, DEVICE_ID)

    const lts2 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 't1', 'update', { status: 'active' }, lts2, DEVICE_ID)

    const lts3 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 't1', 'delete', null, lts3, DEVICE_ID)

    const rows = db.select('SELECT lamport_ts, action FROM sync_log ORDER BY lamport_ts')
    expect(rows).toHaveLength(3)
    expect(rows[0].lamport_ts).toBeLessThan(rows[1].lamport_ts)
    expect(rows[1].lamport_ts).toBeLessThan(rows[2].lamport_ts)
    expect(rows.map(r => r.action)).toEqual(['insert', 'update', 'delete'])
  })

  it('device_id is present in all sync_log entries', async () => {
    const lts1 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 't1', 'insert', {}, lts1, DEVICE_ID)
    const lts2 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'lists', 'Work', 'insert', { name: 'Work' }, lts2, DEVICE_ID)
    const lts3 = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tags', 'urgent', 'insert', { name: 'urgent' }, lts3, DEVICE_ID)

    const rows = db.select('SELECT device_id FROM sync_log')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.device_id).toBe(DEVICE_ID)
    }
  })

  it('each sync_log entry gets a unique ULID id', async () => {
    const lts = await nextLamport(db, DEVICE_ID)
    await logChange(db, 'tasks', 't1', 'insert', {}, lts, DEVICE_ID)
    await logChange(db, 'tasks', 't2', 'insert', {}, lts, DEVICE_ID)
    await logChange(db, 'tasks', 't3', 'insert', {}, lts, DEVICE_ID)

    const ids = db.select('SELECT id FROM sync_log').map(r => r.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3) // all unique
  })

  it('logs different entity types correctly', async () => {
    const entities = ['tasks', 'notes', 'lists', 'tags', 'flows', 'personas', 'flow_meta', 'meta']
    for (let i = 0; i < entities.length; i++) {
      const lts = await nextLamport(db, DEVICE_ID)
      await logChange(db, entities[i], `id_${i}`, 'insert', { name: `test_${i}` }, lts, DEVICE_ID)
    }

    const rows = db.select('SELECT entity FROM sync_log ORDER BY lamport_ts')
    expect(rows.map(r => r.entity)).toEqual(entities)
  })
})
