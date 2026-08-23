/**
 * Path & config resolution shared by to-db.mjs / build-domain.mjs / selftest.mjs.
 *
 * Resolution order (first hit wins):
 *   dbPath:   env TO_DB_PATH  -> config.local.json -> config.json -> per-OS default
 *   repoPath: env TO_REPO_PATH -> config.local.json -> config.json -> walk up from
 *             the skill directory looking for repo markers (works out of the box
 *             when the skill lives inside the Task Orchestrator repo).
 *
 * config.local.json is gitignored — put machine-specific overrides there
 * (e.g. a custom DB location chosen in the app's Settings), never in config.json.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const libDir = dirname(fileURLToPath(import.meta.url))
export const skillRoot = resolve(libDir, '..')

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

export function loadConfig() {
  const base = readJson(join(skillRoot, 'config.json')) || {}
  const local = readJson(join(skillRoot, 'config.local.json')) || {}
  return { ...base, ...local }
}

const APP_ID = 'com.task-orchestrator.app'

export function defaultDbPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    return join(appData, APP_ID, 'tasks.db')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_ID, 'tasks.db')
  }
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(xdg, APP_ID, 'tasks.db')
}

/**
 * The instance registry: a small SQLite file at the app's FIXED per-OS data
 * dir (independent of where the tasks DB lives). App 2.8+ upserts a row
 * {session_id, db_path, app_version, heartbeat_at} on startup and refreshes
 * the heartbeat every ~10s — this is how external agents discover which
 * database each running app instance actually has open.
 */
export function defaultRegistryPath() {
  return join(dirname(defaultDbPath()), 'instances.db')
}

function isRepoRoot(dir) {
  return existsSync(join(dir, 'shared', 'core', 'taskActions.ts')) &&
         existsSync(join(dir, 'tauri-app', 'package.json'))
}

export function autoRepoPath() {
  let dir = skillRoot
  for (let i = 0; i < 6; i++) {
    if (isRepoRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function normalizeDbPath(p) {
  const s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '')
  // Windows and macOS filesystems are case-insensitive; Linux is not.
  return process.platform === 'linux' ? s : s.toLowerCase()
}

// Matches "Task Orchestrator.exe", "task-orchestrator" and the 15-char
// truncated comm on Linux ("task-orchestrat").
const APP_PROC_RE = /task[ ._-]orchestrat/i

export function appProcesses() {
  // Test hook: TO_DB_TEST_FAKE_APP=<n> yields n fake app processes with pids
  // 0..n-1, so tests can exercise guard branches deterministically.
  if (process.env.TO_DB_TEST_FAKE_APP) {
    const n = Math.max(1, parseInt(process.env.TO_DB_TEST_FAKE_APP) || 1)
    return Array.from({ length: n }, (_, i) => ({ name: `task-orchestrator.exe (fake ${i})`, pid: i }))
  }
  try {
    const found = []
    if (process.platform === 'win32') {
      const csv = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
      for (const line of csv.split('\n')) {
        const m = line.match(/^"([^"]+)","(\d+)"/)
        if (m && APP_PROC_RE.test(m[1])) found.push({ name: m[1], pid: parseInt(m[2]) })
      }
    } else {
      const ps = execFileSync('ps', ['-Ao', 'pid=,comm='], { encoding: 'utf8' })
      for (const line of ps.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/)
        if (m && APP_PROC_RE.test(m[2])) found.push({ name: m[2].trim(), pid: parseInt(m[1]) })
      }
    }
    return found
  } catch { return [] } // process listing unavailable — treat as unknown, not fatal
}

/**
 * Read live app instances from the registry. Returns [] when the registry
 * doesn't exist (app closed or pre-2.8).
 *
 * A row is valid when its pid belongs to a LIVE app process — robust against
 * JS timer throttling in minimized windows (which starves heartbeats) and
 * against crashes (a dead pid invalidates the row instantly). Rows without a
 * pid (get_pid failed in-app) fall back to heartbeat freshness. Invalid rows
 * are garbage-collected. If one pid somehow carries several rows (pid reuse
 * after a crash), the freshest heartbeat wins.
 */
export function readAppInstances({ DatabaseSync, freshMs = 120_000 } = {}) {
  const registryPath = process.env.TO_REGISTRY_PATH || defaultRegistryPath()
  if (!existsSync(registryPath)) return []
  const livePids = new Set(appProcesses().map(p => p.pid))
  let db
  try {
    db = new DatabaseSync(registryPath)
    db.exec('PRAGMA busy_timeout = 3000')
    const rows = db.prepare('SELECT session_id, db_path, app_version, heartbeat_at, pid FROM instances').all()
    const now = Date.now()
    const valid = []
    for (const r of rows) {
      const beat = Date.parse(r.heartbeat_at)
      const ok = r.pid !== null && r.pid !== undefined
        ? livePids.has(Number(r.pid))
        : Number.isFinite(beat) && now - beat <= freshMs
      if (ok) {
        valid.push({ sessionId: r.session_id, dbPath: r.db_path, appVersion: r.app_version, heartbeatAt: r.heartbeat_at, pid: r.pid ?? null })
      } else {
        try { db.prepare('DELETE FROM instances WHERE session_id = ?').run(r.session_id) } catch {}
      }
    }
    // Dedupe rows sharing a pid — keep the freshest heartbeat
    const byPid = new Map()
    const result = []
    for (const i of valid.sort((a, b) => String(b.heartbeatAt).localeCompare(String(a.heartbeatAt)))) {
      if (i.pid !== null) {
        if (byPid.has(i.pid)) continue
        byPid.set(i.pid, true)
      }
      result.push(i)
    }
    return result
  } catch { return [] } finally { try { db?.close() } catch {} }
}

export function resolvePaths({ DatabaseSync } = {}) {
  const config = loadConfig()
  const repoPath = process.env.TO_REPO_PATH ||
    (config.repoPath && config.repoPath !== 'auto' ? config.repoPath : autoRepoPath())

  let dbPath = process.env.TO_DB_PATH ||
    (config.dbPath && config.dbPath !== 'auto' ? config.dbPath : null)
  let dbPathSource = process.env.TO_DB_PATH ? 'env' : dbPath ? 'config' : null
  let instances = []
  if (DatabaseSync) instances = readAppInstances({ DatabaseSync })

  if (!dbPath) {
    // Follow the running app: it knows its DB (incl. custom paths set in its
    // Settings, which live in WebView storage and are unreadable externally).
    const distinct = [...new Map(instances.map(i => [normalizeDbPath(i.dbPath), i.dbPath])).values()]
    if (distinct.length === 1) { dbPath = distinct[0]; dbPathSource = 'app-instance' }
    else if (distinct.length > 1) {
      const err = new Error(
        `Multiple running app instances use DIFFERENT databases: ${distinct.join(' | ')}. ` +
        `Set the target explicitly via the TO_DB_PATH env var or "dbPath" in config.local.json.`)
      err.code = 'AMBIGUOUS_DB'
      throw err
    } else { dbPath = defaultDbPath(); dbPathSource = 'default' }
  }
  return { config, dbPath, dbPathSource, repoPath, skillRoot, instances }
}
