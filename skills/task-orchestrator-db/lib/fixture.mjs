/**
 * Throwaway fixture database for self-tests, built from the repo's OWN schema
 * migrations (via the domain bundle) — no real user data involved.
 * Used by bin/selftest.mjs and mcp/selftest.mjs.
 */
import { spawnSync } from 'node:child_process'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { skillRoot } from './paths.mjs'

/** Rebuild dist/domain.mjs if needed and import it. */
export async function loadDomainBundle() {
  const r = spawnSync(process.execPath, [join(skillRoot, 'bin', 'build-domain.mjs')], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`domain bundle build failed: ${r.stderr || r.stdout}`)
  return import(pathToFileURL(join(skillRoot, 'dist', 'domain.mjs')).href)
}

/** Create/update an instance-registry row (what the app does on startup).
 *  pid defaults to 0 — matching the first fake process that the CLI's
 *  TO_DB_TEST_FAKE_APP hook reports (pids 0..n-1). pid: null exercises the
 *  heartbeat-freshness fallback path. */
export function writeRegistryRow(registryPath, dbPath, { sessionId = 'test-session', stale = false, version = '2.8.0-test', pid = 0 } = {}) {
  const db = new DatabaseSync(registryPath)
  db.exec(`CREATE TABLE IF NOT EXISTS instances (
    session_id TEXT PRIMARY KEY, db_path TEXT NOT NULL,
    app_version TEXT, heartbeat_at TEXT NOT NULL, pid INTEGER)`)
  const beat = stale ? new Date(Date.now() - 10 * 60_000).toISOString() : new Date().toISOString()
  db.prepare('INSERT OR REPLACE INTO instances (session_id, db_path, app_version, heartbeat_at, pid) VALUES (?,?,?,?,?)')
    .run(sessionId, dbPath, version, beat, pid)
  db.close()
}

/**
 * Build a fresh migrated DB in its own temp dir.
 * options.withRegistry — also create an instance registry with a fresh row for
 * this DB (as app 2.8+ does), so mutations run without guard overrides even
 * when a real Task Orchestrator process is up on the machine running the tests.
 * Tests MUST point the CLI at the fixture registry via TO_REGISTRY_PATH —
 * otherwise it would read the real one in the user's appdata.
 */
export async function buildFixture({ withRegistry = false } = {}) {
  const domain = await loadDomainBundle()
  const workDir = mkdtempSync(join(tmpdir(), 'to-selftest-'))
  const dbPath = join(workDir, 'tasks.db')

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  for (const sql of domain.MIGRATIONS_V1) db.exec(sql)
  for (let v = 2; v <= domain.LATEST_SCHEMA_VERSION; v++) {
    for (const sql of domain.VERSIONED_MIGRATIONS[v] || []) {
      try { db.exec(sql) } catch (e) { if (!/duplicate|already exists/.test(e.message)) throw e }
    }
  }
  const appDeviceId = domain.ulid()
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('schema_version', ?)").run(String(domain.LATEST_SCHEMA_VERSION))
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('device_id', ?)").run(appDeviceId)
  db.prepare('INSERT OR IGNORE INTO vector_clock (device_id, counter) VALUES (?, 1)').run(appDeviceId)
  db.close()

  const registryPath = join(workDir, 'registry.db')
  if (withRegistry) writeRegistryRow(registryPath, dbPath)

  const cleanup = () => {
    rmSync(workDir, { recursive: true, force: true })
    // The CLI keys its journal by DB path — remove this fixture's journal file.
    const dbKey = createHash('sha1').update(dbPath.toLowerCase().replace(/\\/g, '/')).digest('hex').slice(0, 12)
    rmSync(join(skillRoot, 'journal', `ops-${dbKey}.jsonl`), { force: true })
  }

  return { workDir, dbPath, registryPath, appDeviceId, domain, cleanup }
}
