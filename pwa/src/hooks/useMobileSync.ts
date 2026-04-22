/**
 * @file useMobileSync.ts
 * @description Mobile Google Drive sync orchestration.
 *
 * Owns: gdriveConnected status, in-progress flags (syncing, autoSyncing),
 * transient syncMsg/syncLog, lastSync timestamp, and GDrive setup dialog
 * state (clientId/clientSecret inputs). Wires auto-sync debounce tied to
 * store.tasks mutations.
 *
 * Contract notes:
 * - `gdriveConnected` reflects store.gdriveGetConfig().hasToken plus a
 *   post-redirect flip via store.gdriveJustConnected.
 * - `handleSyncNow()` is the single entry point for manual and auto sync;
 *   it tracks in-progress state with a ref so auto-sync skips when a
 *   manual sync is still running.
 * - Auto-sync fires 3s after store.tasks changes (debounced), only when
 *   connected AND user has not disabled `pwa_auto_sync` meta.
 */
import { useState, useCallback, useEffect, useRef, Dispatch, SetStateAction } from 'react'

export interface MobileSync {
  gdriveConnected: boolean
  setGdriveConnected: Dispatch<SetStateAction<boolean>>
  showGdriveSetup: boolean
  setShowGdriveSetup: Dispatch<SetStateAction<boolean>>
  gdriveClientId: string
  setGdriveClientId: Dispatch<SetStateAction<string>>
  gdriveClientSecret: string
  setGdriveClientSecret: Dispatch<SetStateAction<string>>
  autoSyncing: boolean
  syncMsg: string | null
  setSyncMsg: Dispatch<SetStateAction<string | null>>
  syncLog: string[]
  addSyncLog: (msg: string) => void
  setSyncLog: Dispatch<SetStateAction<string[]>>
  lastSync: string | null
  setLastSync: Dispatch<SetStateAction<string | null>>
  handleSyncNow: () => Promise<void>
}

export function useMobileSync(store: any, t: (key: string) => string, locale: string): MobileSync {
  const [syncLog, setSyncLog] = useState<string[]>([])
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [gdriveConnected, setGdriveConnected] = useState(false)
  const [showGdriveSetup, setShowGdriveSetup] = useState(false)
  const [gdriveClientId, setGdriveClientId] = useState('')
  const [gdriveClientSecret, setGdriveClientSecret] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [autoSyncing, setAutoSyncing] = useState(false)

  const autoSyncTimerRef = useRef<any>(null)
  const syncInProgressRef = useRef(false)
  const prevTasksRef = useRef<any>(null)

  const addSyncLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US',
      { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setSyncLog(prev => [...prev, `[${ts}] ${msg}`])
  }, [locale])

  // Check gdrive connection and load last sync on mount
  useEffect(() => {
    store.gdriveGetConfig?.().then((cfg: any) => {
      if (cfg?.hasToken) setGdriveConnected(true)
      if (cfg?.clientId) setGdriveClientId(cfg.clientId)
    })
    if (store.metaSettings?.last_sync) setLastSync(store.metaSettings.last_sync)
  }, [store, store.metaSettings])

  // React to OAuth redirect completing in browserStore
  useEffect(() => {
    if (store.gdriveJustConnected) setGdriveConnected(true)
  }, [store.gdriveJustConnected])

  const autoSyncEnabled = store.metaSettings?.pwa_auto_sync !== 'false'

  const handleSyncNow = useCallback(async () => {
    if (!store.gdriveSyncNow || !gdriveConnected) return
    syncInProgressRef.current = true
    addSyncLog(t('sync.gdriveSyncing'))
    try {
      const r = await store.gdriveSyncNow()
      if (r) {
        setSyncMsg(`+${r.applied}`)
        setLastSync(new Date().toISOString())
        addSyncLog(t('sync.gdriveSynced').replace('{applied}', r.applied).replace('{outdated}', r.outdated).replace('{uploaded}', r.uploaded))
      }
    } catch (e: any) {
      setSyncMsg(t('sync.gdriveError'))
      addSyncLog(`${t('sync.gdriveError')}: ${e.message}`)
    } finally {
      syncInProgressRef.current = false
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }, [store, gdriveConnected, t, addSyncLog])

  useEffect(() => {
    if (!autoSyncEnabled || !gdriveConnected || !store.gdriveSyncNow) return
    if (prevTasksRef.current !== null && prevTasksRef.current !== store.tasks
        && prevTasksRef.current.length > 0 && !syncInProgressRef.current) {
      clearTimeout(autoSyncTimerRef.current)
      autoSyncTimerRef.current = setTimeout(async () => {
        if (syncInProgressRef.current) return
        syncInProgressRef.current = true
        setAutoSyncing(true)
        try { await handleSyncNow() } catch { /* swallow — logged above */ }
        syncInProgressRef.current = false
        setAutoSyncing(false)
      }, 3000)
    }
    prevTasksRef.current = store.tasks
  }, [store.tasks, autoSyncEnabled, gdriveConnected, handleSyncNow, store.gdriveSyncNow])

  return {
    gdriveConnected, setGdriveConnected,
    showGdriveSetup, setShowGdriveSetup,
    gdriveClientId, setGdriveClientId,
    gdriveClientSecret, setGdriveClientSecret,
    autoSyncing,
    syncMsg, setSyncMsg,
    syncLog, addSyncLog, setSyncLog,
    lastSync, setLastSync,
    handleSyncNow,
  }
}
