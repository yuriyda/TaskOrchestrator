// @vitest-environment node
/**
 * Sync engine tests — state-based sync with vector clock delta computation.
 *
 * Uses two in-memory SQLite databases to simulate two devices syncing
 * through computeSyncPackage + importSyncPackage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { logChange, nextLamport } from './store/helpers.js'
import { computeSyncPackage, importSyncPackage, exportDeltas, clearSyncLog, getVectorClock, filterNewDeltas } from './store/sync.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function wrapDb(betterDb) {
  return {
    execute(sql, params = []) { return betterDb.prepare(sql).run(...params) },
    select(sql, params = []) { return betterDb.prepare(sql).all(...params) },
  }
}

function createDeviceDb(deviceId) {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'inbox',
      priority INTEGER NOT NULL DEFAULT 4, list_name TEXT, due TEXT, recurrence TEXT,
      flow_id TEXT, depends_on TEXT, tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, url TEXT, date_start TEXT, estimate TEXT,
      postponed INTEGER NOT NULL DEFAULT 0, rtm_series_id TEXT,
      personas TEXT NOT NULL DEFAULT '[]', completed_at TEXT,
      updated_at TEXT, deleted_at TEXT, device_id TEXT,
      lamport_ts INTEGER NOT NULL DEFAULT 0
    )
  `)
  raw.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY, task_series_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at TEXT, updated_at TEXT, device_id TEXT, lamport_ts INTEGER NOT NULL DEFAULT 0)`)
  raw.exec(`CREATE TABLE lists    (name TEXT PRIMARY KEY)`)
  raw.exec(`CREATE TABLE tags     (name TEXT PRIMARY KEY)`)
  raw.exec(`CREATE TABLE flows    (name TEXT PRIMARY KEY)`)
  raw.exec(`CREATE TABLE personas (name TEXT PRIMARY KEY)`)
  raw.exec(`CREATE TABLE flow_meta (name TEXT PRIMARY KEY, description TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', deadline TEXT)`)
  raw.exec(`CREATE TABLE meta     (key TEXT PRIMARY KEY, value TEXT)`)
  raw.exec(`CREATE TABLE vector_clock (device_id TEXT PRIMARY KEY, counter INTEGER NOT NULL DEFAULT 0)`)
  raw.exec(`CREATE TABLE sync_log (id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, lamport_ts INTEGER NOT NULL, device_id TEXT NOT NULL, data TEXT)`)
  raw.exec(`CREATE TABLE sync_activity_log (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, task_id TEXT, task_title TEXT, action TEXT NOT NULL, changed_fields TEXT, device_id TEXT, is_duplicate INTEGER DEFAULT 0, incoming_data TEXT)`)
  raw.exec(`INSERT INTO meta VALUES ('device_id', '${deviceId}')`)
  raw.exec(`INSERT INTO vector_clock VALUES ('${deviceId}', 0)`)
  return { raw, db: wrapDb(raw) }
}

function insertTask(raw, id, title, deviceId, lamportTs, extra = {}) {
  raw.exec(`INSERT INTO tasks (id, title, status, priority, tags, created_at, device_id, lamport_ts, list_name, personas)
    VALUES ('${id}', '${title}', '${extra.status || 'inbox'}', ${extra.priority || 4}, '${JSON.stringify(extra.tags || [])}', '2026-03-30T10:00:00Z', '${deviceId}', ${lamportTs}, ${extra.list ? `'${extra.list}'` : 'NULL'}, '[]')`)
  if (extra.list) raw.exec(`INSERT OR IGNORE INTO lists VALUES ('${extra.list}')`)
  if (extra.tags) for (const t of extra.tags) raw.exec(`INSERT OR IGNORE INTO tags VALUES ('${t}')`)
}

const DEV_A = 'DEVICE_AAAA'
const DEV_B = 'DEVICE_BBBB'

// ─── computeSyncPackage ─────────────────────────────────────────────────────

describe('computeSyncPackage', () => {
  let devA

  beforeEach(() => { devA = createDeviceDb(DEV_A) })

  it('full export (empty targetVC) returns all tasks', async () => {
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertTask(devA.raw, 't2', 'Task 2', DEV_A, 2)

    const pkg = await computeSyncPackage(devA.db, {})
    expect(pkg.type).toBe('sync_package')
    expect(pkg.tasks).toHaveLength(2)
    expect(pkg.deviceId).toBe(DEV_A)
  })

  it('delta export filters by targetVC', async () => {
    insertTask(devA.raw, 't1', 'Old', DEV_A, 1)
    insertTask(devA.raw, 't2', 'New', DEV_A, 5)

    const pkg = await computeSyncPackage(devA.db, { [DEV_A]: 3 })
    expect(pkg.tasks).toHaveLength(1)
    expect(pkg.tasks[0].title).toBe('New')
  })

  it('includes lookup tables always', async () => {
    devA.raw.exec("INSERT INTO lists VALUES ('Work')")
    devA.raw.exec("INSERT INTO tags VALUES ('urgent')")
    devA.raw.exec("INSERT INTO flows VALUES ('Sprint1')")
    devA.raw.exec("INSERT INTO personas VALUES ('Alice')")

    const pkg = await computeSyncPackage(devA.db, { [DEV_A]: 999 }) // high VC = no tasks
    expect(pkg.tasks).toHaveLength(0)
    expect(pkg.lists).toContain('Work')
    expect(pkg.tags).toContain('urgent')
    expect(pkg.flows).toContain('Sprint1')
    expect(pkg.personas).toContain('Alice')
  })

  it('includes notes for exported tasks', async () => {
    insertTask(devA.raw, 't1', 'Task', DEV_A, 1)
    devA.raw.exec("INSERT INTO notes (id, task_series_id, content, created_at) VALUES ('n1', 't1', 'Note content', 1000)")

    const pkg = await computeSyncPackage(devA.db, {})
    expect(pkg.notes).toHaveLength(1)
    expect(pkg.notes[0].content).toBe('Note content')
  })
})

// ─── importSyncPackage ──────────────────────────────────────────────────────

describe('importSyncPackage — tasks', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('inserts new task from remote package', async () => {
    insertTask(devA.raw, 't1', 'From A', DEV_A, 3, { list: 'Work', tags: ['urgent'] })
    devA.raw.exec("UPDATE vector_clock SET counter = 3 WHERE device_id = '" + DEV_A + "'")

    const pkg = await computeSyncPackage(devA.db, {})
    const { stats } = await importSyncPackage(devB.db, pkg)

    expect(stats.applied).toBe(1)
    const [row] = devB.db.select('SELECT * FROM tasks WHERE id = ?', ['t1'])
    expect(row.title).toBe('From A')
    expect(devB.db.select('SELECT name FROM lists')[0].name).toBe('Work')
  })

  it('updates task when incoming lamport_ts is higher', async () => {
    insertTask(devB.raw, 't1', 'Old', DEV_B, 2)
    insertTask(devA.raw, 't1', 'Updated', DEV_A, 5)

    const pkg = await computeSyncPackage(devA.db, {})
    const { stats } = await importSyncPackage(devB.db, pkg)

    expect(stats.applied).toBe(1)
    const [row] = devB.db.select('SELECT title FROM tasks WHERE id = ?', ['t1'])
    expect(row.title).toBe('Updated')
  })

  it('rejects update when local is newer (outdated)', async () => {
    insertTask(devB.raw, 't1', 'Local', DEV_B, 10)
    insertTask(devA.raw, 't1', 'Remote', DEV_A, 3)

    const pkg = await computeSyncPackage(devA.db, {})
    const { stats } = await importSyncPackage(devB.db, pkg)

    expect(stats.outdated).toBe(1)
    const [row] = devB.db.select('SELECT title FROM tasks WHERE id = ?', ['t1'])
    expect(row.title).toBe('Local')
  })

  it('skips own tasks that bounced back', async () => {
    insertTask(devA.raw, 't1', 'Mine', DEV_A, 3)
    const pkg = await computeSyncPackage(devA.db, {})
    const { stats } = await importSyncPackage(devA.db, pkg)

    expect(stats.skipped).toBe(1)
    expect(stats.applied).toBe(0)
  })
})

describe('importSyncPackage — response generation', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('generates response with tasks sender has not seen', async () => {
    // A has t1, B has t2
    insertTask(devA.raw, 'tA', 'From A', DEV_A, 1)
    devA.raw.exec("UPDATE vector_clock SET counter = 1 WHERE device_id = '" + DEV_A + "'")

    insertTask(devB.raw, 'tB', 'From B', DEV_B, 1)
    devB.raw.exec("UPDATE vector_clock SET counter = 1 WHERE device_id = '" + DEV_B + "'")

    // A sends package to B
    const pkgFromA = await computeSyncPackage(devA.db, {})
    const { stats, response } = await importSyncPackage(devB.db, pkgFromA)

    // B applied A's task
    expect(stats.applied).toBe(1)

    // Response contains B's task (that A hasn't seen)
    expect(response.tasks.length).toBeGreaterThanOrEqual(1)
    const responseTaskIds = response.tasks.map(t => t.id)
    expect(responseTaskIds).toContain('tB')
  })

  it('response is empty when sender has everything', async () => {
    // B has nothing, A sends package
    insertTask(devA.raw, 'tA', 'From A', DEV_A, 1)
    devA.raw.exec("UPDATE vector_clock SET counter = 1 WHERE device_id = '" + DEV_A + "'")

    const pkgFromA = await computeSyncPackage(devA.db, {})
    const { response } = await importSyncPackage(devB.db, pkgFromA)

    // B has no tasks of its own, response should have no tasks for A
    // (tA was just received and is owned by DEV_A, so it'll be filtered by A's VC)
    const ownTasks = response.tasks.filter(t => t.deviceId === DEV_B)
    expect(ownTasks).toHaveLength(0)
  })
})

describe('vector clock merge', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('updates remote device counter in local vector_clock', async () => {
    devA.raw.exec("UPDATE vector_clock SET counter = 5 WHERE device_id = '" + DEV_A + "'")

    const pkg = await computeSyncPackage(devA.db, {})
    await importSyncPackage(devB.db, pkg)

    const vc = await getVectorClock(devB.db)
    expect(vc[DEV_A]).toBe(5)
  })

  it('does not decrease remote counter', async () => {
    devB.raw.exec(`INSERT INTO vector_clock VALUES ('${DEV_A}', 10)`)

    const pkg = { type: 'sync_package', deviceId: DEV_A, vectorClock: { [DEV_A]: 3 }, tasks: [], notes: [], lists: [], tags: [], flows: [], personas: [], flowMeta: [] }
    await importSyncPackage(devB.db, pkg)

    const vc = await getVectorClock(devB.db)
    expect(vc[DEV_A]).toBe(10) // MAX(10, 3) = 10
  })
})

describe('full bidirectional sync scenario', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('two devices create tasks, sync both ways, converge', async () => {
    // A creates task
    insertTask(devA.raw, 'tA', 'From A', DEV_A, 1, { list: 'Work' })
    devA.raw.exec("UPDATE vector_clock SET counter = 1 WHERE device_id = '" + DEV_A + "'")

    // B creates task
    insertTask(devB.raw, 'tB', 'From B', DEV_B, 1, { status: 'active' })
    devB.raw.exec("UPDATE vector_clock SET counter = 1 WHERE device_id = '" + DEV_B + "'")

    // A → B: A sends full export
    const pkgA = await computeSyncPackage(devA.db, {})
    const { stats: statsB, response: responseForA } = await importSyncPackage(devB.db, pkgA)
    expect(statsB.applied).toBe(1) // B got tA

    // B → A: use response (auto-generated)
    const { stats: statsA } = await importSyncPackage(devA.db, responseForA)
    expect(statsA.applied).toBe(1) // A got tB

    // Both should have both tasks
    const tasksA = devA.db.select('SELECT id FROM tasks ORDER BY id')
    const tasksB = devB.db.select('SELECT id FROM tasks ORDER BY id')
    expect(tasksA.map(r => r.id)).toEqual(['tA', 'tB'])
    expect(tasksB.map(r => r.id)).toEqual(['tA', 'tB'])
  })

  it('recovery from zero: empty device gets full state', async () => {
    // A has 3 tasks
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertTask(devA.raw, 't2', 'Task 2', DEV_A, 2)
    insertTask(devA.raw, 't3', 'Task 3', DEV_A, 3)
    devA.raw.exec("UPDATE vector_clock SET counter = 3 WHERE device_id = '" + DEV_A + "'")

    // B is empty — full export from A
    const pkg = await computeSyncPackage(devA.db, {})
    expect(pkg.tasks).toHaveLength(3)

    const { stats } = await importSyncPackage(devB.db, pkg)
    expect(stats.applied).toBe(3)

    const tasksB = devB.db.select('SELECT id FROM tasks ORDER BY id')
    expect(tasksB).toHaveLength(3)
  })

  it('delta sync only sends new changes', async () => {
    insertTask(devA.raw, 't1', 'Old', DEV_A, 1)
    insertTask(devA.raw, 't2', 'New', DEV_A, 5)
    devA.raw.exec("UPDATE vector_clock SET counter = 5 WHERE device_id = '" + DEV_A + "'")

    // B already knows A up to 3
    const pkg = await computeSyncPackage(devA.db, { [DEV_A]: 3 })
    expect(pkg.tasks).toHaveLength(1) // only t2
    expect(pkg.tasks[0].id).toBe('t2')
  })
})

describe('clearSyncLog', () => {
  let devA

  beforeEach(() => { devA = createDeviceDb(DEV_A) })

  it('removes entries up to given lamport_ts', async () => {
    const lts1 = await nextLamport(devA.db, DEV_A)
    await logChange(devA.db, 'tasks', 't1', 'insert', {}, lts1, DEV_A)
    const lts2 = await nextLamport(devA.db, DEV_A)
    await logChange(devA.db, 'tasks', 't2', 'insert', {}, lts2, DEV_A)
    const lts3 = await nextLamport(devA.db, DEV_A)
    await logChange(devA.db, 'tasks', 't3', 'insert', {}, lts3, DEV_A)

    await clearSyncLog(devA.db, 2)

    const remaining = devA.db.select('SELECT * FROM sync_log')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].entity_id).toBe('t3')
  })
})

describe('filterNewDeltas', () => {
  it('filters out already-seen deltas based on local vector clock', () => {
    const deltas = [
      { deviceId: DEV_A, lamportTs: 1 },
      { deviceId: DEV_A, lamportTs: 2 },
      { deviceId: DEV_A, lamportTs: 3 },
      { deviceId: DEV_B, lamportTs: 1 },
    ]
    const localVC = { [DEV_A]: 2 }

    const filtered = filterNewDeltas(deltas, localVC)
    expect(filtered).toHaveLength(2) // A:3 and B:1
  })
})

// ─── Note deletion propagation via sync ─────────────────────────────────────

function insertNote(raw, id, taskSeriesId, content, deviceId, lamportTs, deletedAt = null) {
  raw.prepare(
    `INSERT INTO notes (id, task_series_id, content, created_at, deleted_at, updated_at, lamport_ts, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, taskSeriesId, content, Date.now(), deletedAt, deletedAt || null, lamportTs, deviceId)
}

describe('note soft-delete sync', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('outbound sync package includes soft-deleted notes', async () => {
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devA.raw, 'n1', 't1', 'Live note', DEV_A, 2)
    insertNote(devA.raw, 'n2', 't1', 'Deleted note', DEV_A, 3, '2026-04-20T10:00:00Z')

    const pkg = await computeSyncPackage(devA.db, {})
    expect(pkg.notes).toHaveLength(2)
    const deleted = pkg.notes.find(n => n.id === 'n2')
    expect(deleted.deletedAt).toBe('2026-04-20T10:00:00Z')
  })

  it('incoming soft-deleted note propagates deletion locally', async () => {
    // Device B has a note
    insertTask(devB.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devB.raw, 'n1', 't1', 'To be deleted', DEV_A, 2)

    // Device A deleted the note (lamport higher)
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devA.raw, 'n1', 't1', 'To be deleted', DEV_A, 5, '2026-04-20T10:00:00Z')

    const pkg = await computeSyncPackage(devA.db, {})
    await importSyncPackage(devB.db, pkg)

    const [row] = devB.db.select('SELECT deleted_at FROM notes WHERE id=?', ['n1'])
    expect(row.deleted_at).toBe('2026-04-20T10:00:00Z')
  })

  it('older incoming note does not overwrite newer local deletion', async () => {
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    // Device A has newer deletion (lamport 5)
    insertNote(devA.raw, 'n1', 't1', 'Deleted', DEV_A, 5, '2026-04-20T10:00:00Z')

    // Device B sends back an older "alive" version (lamport 2)
    insertTask(devB.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devB.raw, 'n1', 't1', 'Alive (old)', DEV_A, 2)

    const pkg = await computeSyncPackage(devB.db, {})
    await importSyncPackage(devA.db, pkg)

    const [row] = devA.db.select('SELECT deleted_at, lamport_ts FROM notes WHERE id=?', ['n1'])
    expect(row.deleted_at).toBe('2026-04-20T10:00:00Z') // local wins
    expect(row.lamport_ts).toBe(5)
  })

  it('new note without deletedAt from remote is inserted cleanly', async () => {
    insertTask(devB.raw, 't1', 'Task 1', DEV_A, 1)
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devA.raw, 'n1', 't1', 'Fresh note', DEV_A, 3)

    const pkg = await computeSyncPackage(devA.db, {})
    await importSyncPackage(devB.db, pkg)

    const [row] = devB.db.select('SELECT content, deleted_at FROM notes WHERE id=?', ['n1'])
    expect(row.content).toBe('Fresh note')
    expect(row.deleted_at).toBeNull()
  })
})

describe('equal lamport conflict resolution', () => {
  let devA, devB

  beforeEach(() => {
    devA = createDeviceDb(DEV_A)
    devB = createDeviceDb(DEV_B)
  })

  it('converges deterministically when two devices edit the same task with equal lamport_ts', async () => {
    // Deterministic tie-break requirement:
    // if lamport_ts is equal, the higher device_id wins.
    insertTask(devA.raw, 't1', 'From A', DEV_A, 5)
    insertTask(devB.raw, 't1', 'From B', DEV_B, 5)
    devA.raw.exec("UPDATE vector_clock SET counter = 5 WHERE device_id = '" + DEV_A + "'")
    devB.raw.exec("UPDATE vector_clock SET counter = 5 WHERE device_id = '" + DEV_B + "'")

    const pkgFromA = await computeSyncPackage(devA.db, {})
    const { response: responseForA } = await importSyncPackage(devB.db, pkgFromA)
    await importSyncPackage(devA.db, responseForA)

    const [rowA] = devA.db.select('SELECT title, device_id, lamport_ts FROM tasks WHERE id = ?', ['t1'])
    const [rowB] = devB.db.select('SELECT title, device_id, lamport_ts FROM tasks WHERE id = ?', ['t1'])

    expect(rowA.title).toBe('From B')
    expect(rowB.title).toBe('From B')
    expect(rowA.device_id).toBe(DEV_B)
    expect(rowB.device_id).toBe(DEV_B)
    expect(rowA.lamport_ts).toBe(5)
    expect(rowB.lamport_ts).toBe(5)
  })

  it('converges deterministically for notes when lamport_ts is equal', async () => {
    insertTask(devA.raw, 't1', 'Task 1', DEV_A, 1)
    insertTask(devB.raw, 't1', 'Task 1', DEV_A, 1)
    insertNote(devA.raw, 'n1', 't1', 'Note from A', DEV_A, 7)
    insertNote(devB.raw, 'n1', 't1', 'Note from B', DEV_B, 7)
    devA.raw.exec("UPDATE vector_clock SET counter = 7 WHERE device_id = '" + DEV_A + "'")
    devB.raw.exec("UPDATE vector_clock SET counter = 7 WHERE device_id = '" + DEV_B + "'")

    const pkgFromA = await computeSyncPackage(devA.db, {})
    const { response: responseForA } = await importSyncPackage(devB.db, pkgFromA)
    await importSyncPackage(devA.db, responseForA)

    const [rowA] = devA.db.select('SELECT content, device_id, lamport_ts FROM notes WHERE id = ?', ['n1'])
    const [rowB] = devB.db.select('SELECT content, device_id, lamport_ts FROM notes WHERE id = ?', ['n1'])

    expect(rowA.content).toBe('Note from B')
    expect(rowB.content).toBe('Note from B')
    expect(rowA.device_id).toBe(DEV_B)
    expect(rowB.device_id).toBe(DEV_B)
    expect(rowA.lamport_ts).toBe(7)
    expect(rowB.lamport_ts).toBe(7)
  })
})
