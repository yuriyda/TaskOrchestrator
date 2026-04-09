// @vitest-environment node
/**
 * SQLite Transaction Behavior Tests
 *
 * PURPOSE: Understand how explicit BEGIN/COMMIT transactions work in SQLite,
 * and why they might fail in the Tauri SQL plugin (tauri-plugin-sql).
 *
 * KEY DIFFERENCE:
 * - better-sqlite3 is SYNCHRONOUS — every call blocks until complete.
 *   This means there is zero concurrency: BEGIN, INSERT, COMMIT execute
 *   sequentially on the same thread with no interleaving.
 * - Tauri SQL plugin wraps rusqlite behind an async Tauri command interface.
 *   Each `invoke("plugin:sql|execute", ...)` is an independent async call.
 *   Between BEGIN and COMMIT, OTHER async commands (from UI re-renders,
 *   effects, timers) can slip in and execute on the SAME connection,
 *   breaking the transaction or causing "database is locked".
 *
 * These tests document the EXPECTED behavior of SQLite transactions,
 * serving as a baseline to understand what goes wrong in async environments.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('SQLite Transaction Behavior (synchronous, better-sqlite3)', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)');
  });

  // --- (a) Basic BEGIN/COMMIT ---
  it('a: basic BEGIN/COMMIT inserts all rows', () => {
    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");
    db.exec("INSERT INTO items VALUES ('2', 'beta')");
    db.exec("INSERT INTO items VALUES ('3', 'gamma')");
    db.exec('COMMIT');

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  // --- (b) ROLLBACK discards all changes ---
  it('b: ROLLBACK discards all inserts', () => {
    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");
    db.exec("INSERT INTO items VALUES ('2', 'beta')");
    db.exec('ROLLBACK');

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(0);
  });

  // --- (c) Nested BEGIN throws ---
  it('c: nested BEGIN throws "cannot start a transaction within a transaction"', () => {
    db.exec('BEGIN');
    expect(() => db.exec('BEGIN')).toThrow(/cannot start a transaction within a transaction/);
    // Clean up — after error the transaction is still active
    db.exec('ROLLBACK');
  });

  // --- (d) SELECT inside a transaction works ---
  it('d: SELECT inside a transaction sees uncommitted rows', () => {
    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');

    db.exec('COMMIT');
  });

  // --- (e) Multiple sequential transactions ---
  it('e: multiple sequential BEGIN/COMMIT pairs work', () => {
    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");
    db.exec('COMMIT');

    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('2', 'beta')");
    db.exec('COMMIT');

    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('3', 'gamma')");
    db.exec('COMMIT');

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(3);
  });

  // --- (f) Simulated async pattern (what Tauri plugin does) ---
  describe('f: simulated async pattern', () => {
    it('f1: wrapping sync calls in async promises preserves order', async () => {
      // Simulate Tauri's invoke() — each SQL call is wrapped in a Promise
      const execute = (sql) => new Promise((resolve) => {
        resolve(db.exec(sql));
      });

      // When awaited sequentially, this is fine — same as sync
      await execute('BEGIN');
      await execute("INSERT INTO items VALUES ('1', 'alpha')");
      await execute("INSERT INTO items VALUES ('2', 'beta')");
      await execute('COMMIT');

      const rows = db.prepare('SELECT * FROM items').all();
      expect(rows).toHaveLength(2);
    });

    it('f2: interleaved async calls break the transaction', async () => {
      // This simulates what happens when another operation sneaks in
      // between BEGIN and COMMIT in the Tauri async environment.
      //
      // Scenario: Component A starts a transaction, Component B does a
      // SELECT or INSERT on the same connection before A commits.

      const execute = (sql) => new Promise((resolve, reject) => {
        try {
          resolve(db.exec(sql));
        } catch (e) {
          reject(e);
        }
      });

      // "Component A" starts a transaction
      await execute('BEGIN');
      await execute("INSERT INTO items VALUES ('1', 'alpha')");

      // "Component B" tries to start its own transaction on the same connection
      // This is exactly what happens in Tauri when multiple React effects
      // fire SQL commands concurrently on a shared connection.
      await expect(execute('BEGIN')).rejects.toThrow(
        /cannot start a transaction within a transaction/
      );

      // Clean up
      await execute('ROLLBACK');
    });

    it('f3: fire-and-forget without await causes unpredictable order', async () => {
      // If BEGIN/INSERT/COMMIT are fired without awaiting each one,
      // microtask scheduling could reorder them.
      // With better-sqlite3 (sync) this still works because the sync
      // call completes inside the Promise constructor. But with a truly
      // async driver, order is NOT guaranteed.

      // We just document that this pattern is dangerous in async:
      const results = [];
      const execute = (label, sql) => new Promise((resolve) => {
        db.exec(sql);
        results.push(label);
        resolve();
      });

      // Fire all at once (no await between them)
      const p1 = execute('BEGIN', 'BEGIN');
      const p2 = execute('INSERT', "INSERT INTO items VALUES ('1', 'x')");
      const p3 = execute('COMMIT', 'COMMIT');
      await Promise.all([p1, p2, p3]);

      // In sync better-sqlite3 this works because Promise constructors
      // run synchronously. In a truly async driver this would be random.
      expect(results).toEqual(['BEGIN', 'INSERT', 'COMMIT']);
      const rows = db.prepare('SELECT * FROM items').all();
      expect(rows).toHaveLength(1);
    });
  });

  // --- (g) BEGIN after autocommit ---
  it('g: BEGIN after autocommit INSERT works fine', () => {
    // Autocommit: each statement without explicit transaction auto-commits
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");

    // Now start an explicit transaction — no conflict
    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('2', 'beta')");
    db.exec('COMMIT');

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(2);
  });

  // --- (h) WAL mode + checkpoint inside transaction ---
  it('h: WAL mode checkpoint inside transaction behavior', () => {
    // Switch to WAL mode
    db.pragma('journal_mode = WAL');

    db.exec('BEGIN');
    db.exec("INSERT INTO items VALUES ('1', 'alpha')");

    // Attempting PRAGMA wal_checkpoint inside an active write transaction
    // throws "database table is locked" — SQLite cannot checkpoint while
    // a write transaction is active. This is a key insight for Tauri:
    // any checkpoint or locking operation during a transaction will fail.
    expect(() => {
      db.pragma('wal_checkpoint(PASSIVE)');
    }).toThrow(/database table is locked/);

    db.exec('COMMIT');

    // After commit, checkpoint works fine
    const result2 = db.pragma('wal_checkpoint(PASSIVE)');
    expect(result2).toBeDefined();

    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toHaveLength(1);
  });
});

describe('SQLite Transaction Behavior with file-based DB', () => {
  // Test with two separate connections to see locking behavior
  it('i: two connections — second writer blocked while first has write txn', () => {
    const fs = require('fs');
    const path = require('path');
    const tmpFile = path.join(require('os').tmpdir(), `test-sqlite-${Date.now()}.db`);

    try {
      const db1 = new Database(tmpFile);
      const db2 = new Database(tmpFile);

      // Both in WAL mode for max concurrency
      db1.pragma('journal_mode = WAL');
      db2.pragma('journal_mode = WAL');

      // Set a short busy timeout so db2 doesn't hang forever waiting for the lock
      db2.pragma('busy_timeout = 100');

      db1.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)');

      // db1 starts a write transaction
      db1.exec('BEGIN IMMEDIATE');
      db1.exec("INSERT INTO items VALUES ('1', 'from-db1')");

      // db2 tries to write — should be blocked/fail with SQLITE_BUSY
      // In WAL mode, readers don't block, but writers do.
      expect(() => {
        db2.exec('BEGIN IMMEDIATE');
      }).toThrow(/database is locked/);

      // However, db2 can still READ in WAL mode
      const rows = db2.prepare('SELECT * FROM items').all();
      // db2 sees the state BEFORE db1's uncommitted transaction (WAL snapshot isolation)
      expect(rows).toHaveLength(0);

      db1.exec('COMMIT');

      // Now db2 can read the committed data
      const rows2 = db2.prepare('SELECT * FROM items').all();
      expect(rows2).toHaveLength(1);

      // And db2 can now write
      db2.exec('BEGIN IMMEDIATE');
      db2.exec("INSERT INTO items VALUES ('2', 'from-db2')");
      db2.exec('COMMIT');

      const rows3 = db1.prepare('SELECT * FROM items').all();
      expect(rows3).toHaveLength(2);

      db1.close();
      db2.close();
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
      try { fs.unlinkSync(tmpFile + '-wal'); } catch {}
      try { fs.unlinkSync(tmpFile + '-shm'); } catch {}
    }
  });
});

// ─── Undo FK cascade regression test (CRITICAL) ────────────────────────────
// This test verifies that the undo pattern (DELETE FROM tasks + re-INSERT)
// does NOT destroy day_plan_slots.task_id via FK ON DELETE SET NULL cascade.

describe('Undo must not destroy planner slot references (REGRESSION)', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'inbox'
    )`);
    db.exec(`CREATE TABLE day_plan_slots (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      slot_type TEXT DEFAULT 'task',
      start_time TEXT,
      end_time TEXT
    )`);
    // Seed data: one task with a planner slot
    db.exec("INSERT INTO tasks VALUES ('t1', 'My Task', 'active')");
    db.exec("INSERT INTO day_plan_slots VALUES ('s1', 't1', 'task', '09:00', '10:00')");
  });

  it('DELETE FROM tasks cascades FK → task_id becomes NULL (demonstrates the bug)', () => {
    // This is the BROKEN pattern: DELETE + INSERT with FK enabled
    db.exec('DELETE FROM tasks');
    db.exec("INSERT INTO tasks VALUES ('t1', 'My Task', 'active')");

    const slot = db.prepare('SELECT task_id FROM day_plan_slots WHERE id = ?').get('s1');
    // FK cascade already fired — task_id is NULL even though task was re-inserted
    expect(slot.task_id).toBeNull();
  });

  it('PRAGMA foreign_keys=OFF prevents cascade during undo (the fix)', () => {
    // This is the FIXED pattern: disable FK before DELETE
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('DELETE FROM tasks');
    db.exec("INSERT INTO tasks VALUES ('t1', 'My Task', 'active')");
    db.exec('PRAGMA foreign_keys = ON');

    const slot = db.prepare('SELECT task_id FROM day_plan_slots WHERE id = ?').get('s1');
    // task_id is preserved because FK cascade was disabled
    expect(slot.task_id).toBe('t1');
  });

  it('planner slot survives full undo cycle (delete all tasks + re-insert)', () => {
    // Simulate: add a second task, undo should restore state without breaking slots
    db.exec("INSERT INTO tasks VALUES ('t2', 'Second Task', 'inbox')");
    db.exec("INSERT INTO day_plan_slots VALUES ('s2', 't2', 'task', '10:00', '11:00')");

    // Save snapshot (what undo stores)
    const snapshot = db.prepare('SELECT * FROM tasks').all();

    // Undo with FK disabled (the fix)
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('DELETE FROM tasks');
    for (const t of snapshot) {
      db.exec(`INSERT INTO tasks VALUES ('${t.id}', '${t.title}', '${t.status}')`);
    }
    db.exec('PRAGMA foreign_keys = ON');

    // Both slots should still reference their tasks
    const slots = db.prepare('SELECT id, task_id FROM day_plan_slots ORDER BY id').all();
    expect(slots).toEqual([
      { id: 's1', task_id: 't1' },
      { id: 's2', task_id: 't2' },
    ]);
  });
});
