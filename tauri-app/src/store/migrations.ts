/**
 * SQLite schema migrations v1–v7. Each version is an array of SQL statements.
 * Migrations are idempotent (CREATE IF NOT EXISTS / ADD COLUMN safe).
 * v6 adds sync preparation fields (updated_at, deleted_at, device_id, sync_log).
 * v7 adds Lamport timestamps and vector clock for decentralized sync.
 */
export const MIGRATIONS_V1: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS lists (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS tags (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS flows (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS personas (
     name TEXT PRIMARY KEY
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id         TEXT PRIMARY KEY,
     title      TEXT NOT NULL,
     status     TEXT NOT NULL DEFAULT 'inbox',
     priority   INTEGER NOT NULL DEFAULT 4,
     list_name  TEXT,
     due        TEXT,
     recurrence TEXT,
     flow_id    TEXT,
     depends_on TEXT,
     tags       TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS notes (
     id             TEXT PRIMARY KEY,
     task_series_id TEXT NOT NULL,
     content        TEXT NOT NULL DEFAULT '',
     created_at     INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_series ON notes(task_series_id)`,
  `CREATE TABLE IF NOT EXISTS meta (
     key   TEXT PRIMARY KEY,
     value TEXT
   )`,
]

export const MIGRATIONS_V2: readonly string[] = [
  `ALTER TABLE tasks ADD COLUMN url          TEXT`,
  `ALTER TABLE tasks ADD COLUMN date_start   TEXT`,
  `ALTER TABLE tasks ADD COLUMN estimate     TEXT`,
  `ALTER TABLE tasks ADD COLUMN postponed    INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN rtm_series_id TEXT`,
]

export const MIGRATIONS_V3: readonly string[] = [
  `ALTER TABLE tasks ADD COLUMN personas TEXT NOT NULL DEFAULT '[]'`,
]

export const MIGRATIONS_V4: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS flow_meta (
     name        TEXT PRIMARY KEY,
     description TEXT NOT NULL DEFAULT '',
     color       TEXT NOT NULL DEFAULT '',
     deadline    TEXT
   )`,
]

export const MIGRATIONS_V5: readonly string[] = [
  `ALTER TABLE tasks ADD COLUMN completed_at TEXT`,
]

export const MIGRATIONS_V6: readonly string[] = [
  `ALTER TABLE tasks ADD COLUMN updated_at TEXT`,
  `ALTER TABLE tasks ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE tasks ADD COLUMN device_id TEXT`,
  `CREATE TABLE IF NOT EXISTS sync_log (
     id         TEXT PRIMARY KEY,
     entity     TEXT NOT NULL,
     entity_id  TEXT NOT NULL,
     action     TEXT NOT NULL,
     timestamp  TEXT NOT NULL,
     device_id  TEXT,
     data       TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity, entity_id)`,
]

export const MIGRATIONS_V7: readonly string[] = [
  // Lamport timestamp on tasks — replaces wall-clock updated_at for causal ordering
  `ALTER TABLE tasks ADD COLUMN lamport_ts INTEGER NOT NULL DEFAULT 0`,
  // Vector clock table — tracks per-device logical counters
  `CREATE TABLE IF NOT EXISTS vector_clock (
     device_id TEXT PRIMARY KEY,
     counter   INTEGER NOT NULL DEFAULT 0
   )`,
  // Rebuild sync_log with lamport_ts instead of wall-clock timestamp
  `DROP TABLE IF EXISTS sync_log`,
  `CREATE TABLE IF NOT EXISTS sync_log (
     id         TEXT PRIMARY KEY,
     entity     TEXT NOT NULL,
     entity_id  TEXT NOT NULL,
     action     TEXT NOT NULL,
     lamport_ts INTEGER NOT NULL,
     device_id  TEXT NOT NULL,
     data       TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_lamport ON sync_log(lamport_ts)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity, entity_id)`,
]

export const LATEST_SCHEMA_VERSION: number = 7
