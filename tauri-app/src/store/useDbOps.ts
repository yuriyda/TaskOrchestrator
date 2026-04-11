/**
 * @file useDbOps.ts
 * DB maintenance domain: open/create/move database, backup management.
 * Extracted from useTauriTaskStore to reduce file size.
 *
 * Rules:
 * - _closeDb flushes WAL and closes the connection — must be called before any DB file operation.
 * - _reinit resets all state and triggers re-init via dbKey increment.
 * - After DB switch/move, the main hook's init useEffect re-runs via dbKey change.
 */
import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { copyFile, remove, exists, readDir } from '@tauri-apps/plugin-fs'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { join } from '@tauri-apps/api/path'
import { DB_PATH_KEY, backupBeforeMigration } from './backup.js'

interface UseDbOpsParams {
  dbRef: MutableRefObject<any>
  dbPath: string
  resetDbSingleton: () => void
  resetAllState: () => void
  setDbKey: (fn: (k: number) => number) => void
}

export function useDbOps({ dbRef, dbPath, resetDbSingleton, resetAllState, setDbKey }: UseDbOpsParams) {

  const _closeDb = useCallback(async () => {
    if (dbRef.current) {
      try { await dbRef.current.execute('PRAGMA wal_checkpoint(TRUNCATE)') } catch {}
      try { await dbRef.current.close() } catch {}
      resetDbSingleton()
      dbRef.current = null
    }
  }, [])

  const _reinit = useCallback((newPath?: string) => {
    if (newPath !== undefined) {
      if (newPath) localStorage.setItem(DB_PATH_KEY, newPath)
      else localStorage.removeItem(DB_PATH_KEY)
    }
    resetAllState()
    setDbKey(k => k + 1)
  }, [])

  // ── Reveal / Open / Create / Move ───────────────────────────────────────

  const revealDb = useCallback(async () => {
    if (!dbPath) return
    try { await revealItemInDir(dbPath) } catch (e) { console.error(e) }
  }, [dbPath])

  const openNewDb = useCallback(async () => {
    const selected = await openFileDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      multiple: false,
    })
    if (!selected) return false
    await _closeDb()
    _reinit(typeof selected === 'string' ? selected : selected[0])
    return true
  }, [_closeDb, _reinit])

  const createNewDb = useCallback(async () => {
    const selected = await saveFileDialog({
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      defaultPath: 'tasks.db',
    })
    if (!selected) return false
    await _closeDb()
    _reinit(selected)
    return true
  }, [_closeDb, _reinit])

  const moveCurrentDb = useCallback(async () => {
    const dir = await openFileDialog({ directory: true, multiple: false })
    if (!dir) return
    const targetDir = typeof dir === 'string' ? dir : dir[0]
    const currentPath = localStorage.getItem(DB_PATH_KEY)
      || await join(await (await import('@tauri-apps/api/path')).appDataDir(), 'tasks.db').catch(() => 'tasks.db')
    const targetPath = await join(targetDir, 'tasks.db')

    await _closeDb()

    try {
      await copyFile(currentPath, targetPath)
      try { await remove(currentPath) } catch {}
      try { if (await exists(currentPath + '-wal')) await remove(currentPath + '-wal') } catch {}
      try { if (await exists(currentPath + '-shm')) await remove(currentPath + '-shm') } catch {}
      _reinit(targetPath)
    } catch (e) {
      console.error('Failed to move DB:', e)
      _reinit()
    }
  }, [_closeDb, _reinit])

  // ── Backup management ───────���───────────────────────────────────────────

  const createBackup = useCallback(async () => {
    if (!dbPath) return false
    try {
      if (dbRef.current) await dbRef.current.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      const [vRow] = await dbRef.current.select("SELECT value FROM meta WHERE key='schema_version'")
      const version = parseInt(vRow?.value || '1')
      await backupBeforeMigration(dbPath, version)
      return true
    } catch (e) { console.error('Manual backup failed:', e); return false }
  }, [dbPath])

  const listBackups = useCallback(async () => {
    if (!dbPath) return []
    try {
      const dir = dbPath.replace(/[/\\][^/\\]*$/, '')
      const entries = await readDir(dir)
      return entries
        .filter(e => e.name && e.name.startsWith('tasks.backup-v') && e.name.endsWith('.db'))
        .map(e => {
          const m = e.name.match(/^tasks\.backup-v(\d+)-(\d{4}-\d{2}-\d{2})\.db$/)
          return {
            name: e.name,
            schemaVersion: m ? parseInt(m[1]) : null,
            date: m ? m[2] : null,
            path: null as string | null,
          }
        })
        .filter(b => b.schemaVersion !== null)
        .sort((a, b) => b.date!.localeCompare(a.date!))
        .map(b => ({ ...b, path: dir + (dir.includes('/') ? '/' : '\\') + b.name }))
    } catch { return [] }
  }, [dbPath])

  const restoreBackup = useCallback(async (backupPath: string) => {
    if (!dbPath || !backupPath) return
    await _closeDb()
    try {
      await copyFile(backupPath, dbPath)
      try { if (await exists(dbPath + '-wal')) await remove(dbPath + '-wal') } catch {}
      try { if (await exists(dbPath + '-shm')) await remove(dbPath + '-shm') } catch {}
    } catch (e) {
      console.error('Failed to restore backup:', e)
    }
    _reinit()
  }, [dbPath, _closeDb, _reinit])

  return {
    revealDb, openNewDb, createNewDb, moveCurrentDb,
    createBackup, listBackups, restoreBackup,
  }
}
