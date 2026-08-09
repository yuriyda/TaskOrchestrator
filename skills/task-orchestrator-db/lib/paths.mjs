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

export function resolvePaths() {
  const config = loadConfig()
  const dbPath = process.env.TO_DB_PATH ||
    (config.dbPath && config.dbPath !== 'auto' ? config.dbPath : defaultDbPath())
  const repoPath = process.env.TO_REPO_PATH ||
    (config.repoPath && config.repoPath !== 'auto' ? config.repoPath : autoRepoPath())
  return { config, dbPath, repoPath, skillRoot }
}
