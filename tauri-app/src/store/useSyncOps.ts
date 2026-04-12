/**
 * @file useSyncOps.ts
 * Sync domain: file-based sync, clipboard sync, Google Drive sync, sync stats/log.
 * Extracted from useTauriTaskStore to reduce file size.
 *
 * Rules:
 * - All functions access DB via dbRef.current — never cache the reference.
 * - After importing data, always call setTasks(await fetchAll(db)) + refreshRef().
 */
import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { exportDeltas, getVectorClock, buildSyncRequest, computeSyncPackage, importSyncPackage } from './sync.js'
import { fetchAll } from './helpers.js'
import { getSyncActivityLog } from './syncActivityLog.js'
import {
  isConnected as gdriveIsConnected, connect as gdriveConnect,
  disconnect as gdriveDisconnect, syncWithDrive,
  hasSyncFile as gdriveHasSyncFile, deleteSyncFile as gdriveDeleteSyncFile,
  readSyncFile as gdriveReadSyncFile, loadTokens as gdriveLoadTokens,
} from './googleDrive.js'

interface UseSyncOpsParams {
  dbRef: MutableRefObject<any>
  deviceIdRef: MutableRefObject<string | null>
  setTasks: (tasks: any) => void
  setMetaSettings: (fn: any) => void
  refreshRef: () => Promise<void>
}

export function useSyncOps({ dbRef, deviceIdRef, setTasks, setMetaSettings, refreshRef }: UseSyncOpsParams) {

  // ── Sync stats / log ────────────────────────────────────────────────────

  const getSyncLog = useCallback(async () => {
    const db = dbRef.current
    if (!db) return []
    const rows = await db.select('SELECT * FROM sync_log ORDER BY lamport_ts DESC')
    return rows.map(r => ({
      id: r.id, entity: r.entity, entityId: r.entity_id,
      action: r.action, lamportTs: r.lamport_ts,
      deviceId: r.device_id, data: r.data ? JSON.parse(r.data) : null,
    }))
  }, [])

  const getSyncStats = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const [countRow] = await db.select('SELECT COUNT(*) as count FROM sync_log')
    const [lastRow] = await db.select("SELECT value FROM meta WHERE key='last_sync_lamport'")
    const vc = await getVectorClock(db)
    const did = deviceIdRef.current
    const pendingCount = lastRow?.value
      ? (await db.select('SELECT COUNT(*) as count FROM sync_log WHERE lamport_ts > ?', [parseInt(lastRow.value)]))[0].count
      : countRow.count
    const [lastSyncRow] = await db.select("SELECT value FROM meta WHERE key='last_sync'")
    return {
      totalEntries: countRow.count,
      pendingCount,
      lastSyncTs: lastRow?.value ? parseInt(lastRow.value) : null,
      lastSync: lastSyncRow?.value || null,
      vectorClock: vc,
      deviceId: did,
    }
  }, [])

  const clearSyncData = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await db.execute('DELETE FROM sync_log')
    await db.execute("DELETE FROM meta WHERE key='last_sync_lamport'")
  }, [])

  // ── File-based sync ─────────────────────────────────────────────────────

  const exportSync = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const [lastRow] = await db.select("SELECT value FROM meta WHERE key='last_sync_lamport'")
    const sinceTs = parseInt(lastRow?.value || '0')
    const pkg = await exportDeltas(db, sinceTs)
    if (pkg.deltas.length === 0) return { count: 0 }
    const json = JSON.stringify(pkg, null, 2)

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `sync-${pkg.deviceId || 'export'}.json`,
          types: [{ description: 'Sync Package', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        const maxTs = Math.max(...pkg.deltas.map(d => d.lamportTs))
        await db.execute("INSERT OR REPLACE INTO meta VALUES ('last_sync_lamport', ?)", [String(maxTs)])
        return { count: pkg.deltas.length }
      } catch (e: any) {
        if (e.name === 'AbortError') return null
        throw e
      }
    }

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sync-${pkg.deviceId || 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
    const maxTs = Math.max(...pkg.deltas.map(d => d.lamportTs))
    await db.execute("INSERT OR REPLACE INTO meta VALUES ('last_sync_lamport', ?)", [String(maxTs)])
    return { count: pkg.deltas.length }
  }, [])

  const importSync = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const selected = await openFileDialog({
      filters: [{ name: 'Sync Package', extensions: ['json'] }],
      multiple: false,
    })
    if (!selected) return null
    const filePath = typeof selected === 'string' ? selected : selected[0]
    let pkg
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const text = await readTextFile(filePath)
      pkg = JSON.parse(text)
    } catch (e) {
      console.error('Failed to read sync file:', e)
      return null
    }
    const { stats: result } = await importSyncPackage(db, pkg)
    setTasks(await fetchAll(db))
    await refreshRef()
    return result
  }, [refreshRef])

  // ── Clipboard sync ──────────────────────────────────────────────────────

  const exportSyncRequest = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const req = await buildSyncRequest(db)
    await navigator.clipboard.writeText(JSON.stringify(req))
    return req
  }, [])

  const handleSyncRequest = useCallback(async (req: any) => {
    const db = dbRef.current
    if (!db || !req || req.type !== 'sync_request') return null
    const pkg = await computeSyncPackage(db, req.vectorClock || {})
    await navigator.clipboard.writeText(JSON.stringify(pkg))
    return { count: pkg.tasks.length, notesCount: pkg.notes.length }
  }, [])

  const importSyncClipboard = useCallback(async (pkg: any) => {
    const db = dbRef.current
    if (!db || !pkg || pkg.type !== 'sync_package') return null
    const { stats, response } = await importSyncPackage(db, pkg)
    if (response.tasks.length > 0 || response.notes.length > 0) {
      await navigator.clipboard.writeText(JSON.stringify(response))
    }
    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", ['last_sync', new Date().toISOString()])
    setTasks(await fetchAll(db))
    await refreshRef()
    return { ...stats, responseCount: response.tasks.length }
  }, [refreshRef])

  // ── Google Drive sync ───────────────────────────────────────────────────

  const gdriveCheckConnection = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveIsConnected(db)
  }, [])

  const gdriveConnectAccount = useCallback(async (clientId: string, clientSecret: string) => {
    const db = dbRef.current
    if (!db) return false
    return gdriveConnect(db, clientId, clientSecret)
  }, [])

  const gdriveDisconnectAccount = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    await gdriveDisconnect(db)
  }, [])

  const gdriveSyncNow = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const result = await syncWithDrive(db, computeSyncPackage, importSyncPackage)
    const isoNow = new Date().toISOString()
    await db.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", ['last_sync', isoNow])
    setMetaSettings(prev => ({ ...prev, last_sync: isoNow }))
    setTasks(await fetchAll(db))
    await refreshRef()
    return result
  }, [refreshRef])

  const gdriveGetConfig = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    const tokens = await gdriveLoadTokens(db)
    return { clientId: tokens.client_id, hasToken: !!tokens.access_token }
  }, [])

  const gdriveCheckSyncFile = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveHasSyncFile(db)
  }, [])

  const gdrivePurgeSyncFile = useCallback(async () => {
    const db = dbRef.current
    if (!db) return false
    return gdriveDeleteSyncFile(db)
  }, [])

  const gdriveReadSyncFileCb = useCallback(async () => {
    const db = dbRef.current
    if (!db) return null
    return gdriveReadSyncFile(db)
  }, [])

  const fetchSyncActivityLog = useCallback(async () => {
    const db = dbRef.current
    if (!db) return []
    return getSyncActivityLog(db)
  }, [])

  return {
    // Sync
    exportSync, importSync, exportSyncRequest, handleSyncRequest, importSyncClipboard,
    getSyncLog, getSyncStats, clearSyncData, fetchSyncActivityLog,
    // Google Drive
    gdriveCheckConnection, gdriveConnectAccount, gdriveDisconnectAccount,
    gdriveSyncNow, gdriveGetConfig, gdriveCheckSyncFile, gdrivePurgeSyncFile,
    gdriveReadSyncFile: gdriveReadSyncFileCb,
  }
}
