/**
 * Database backup utilities: path resolution, pre-migration backup, rotation (keeps MAX_BACKUPS).
 * Depends on Tauri FS/path plugins — only works in Tauri runtime.
 */
import { appDataDir, join } from '@tauri-apps/api/path'
import { copyFile, remove, exists, readDir } from '@tauri-apps/plugin-fs'

export const MAX_BACKUPS = 2
export const DB_PATH_KEY = 'to_db_path'

export async function resolveDbPath() {
  const customPath = localStorage.getItem(DB_PATH_KEY)
  if (customPath) return customPath
  try {
    const dir = await appDataDir()
    return await join(dir, 'tasks.db')
  } catch { return null }
}

export async function backupBeforeMigration(dbPath, fromVersion) {
  if (!dbPath) return
  try {
    const fileExists = await exists(dbPath)
    if (!fileExists) return

    const date = new Date().toISOString().slice(0, 10)
    const dir = dbPath.replace(/[/\\][^/\\]*$/, '')
    const backupName = `tasks.backup-v${fromVersion}-${date}.db`
    const backupPath = await join(dir, backupName)

    await copyFile(dbPath, backupPath)

    // Rotate: keep only MAX_BACKUPS most recent backup files
    try {
      const entries = await readDir(dir)
      const backups = entries
        .filter(e => e.name && e.name.startsWith('tasks.backup-v') && e.name.endsWith('.db'))
        .map(e => e.name)
        .sort()
        .reverse()
      for (const old of backups.slice(MAX_BACKUPS)) {
        try { await remove(await join(dir, old)) } catch (_) {}
      }
    } catch (_) {}
  } catch (err) {
    console.error('Backup before migration failed:', err)
  }
}
