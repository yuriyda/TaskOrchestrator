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
  manualSyncing: boolean
  syncError: string | null
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
  // Initialize from store.metaSettings synchronously so the focus-sync
  // throttle has a real baseline before the first event fires — otherwise
  // a focus arriving during initial mount would see lastSync=null and
  // trigger an immediate sync regardless of how recent the previous run was.
  const [lastSync, setLastSync] = useState<string | null>(() => store.metaSettings?.last_sync || null)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [manualSyncing, setManualSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const autoSyncTimerRef = useRef<any>(null)
  const syncInProgressRef = useRef(false)
  const prevTasksRef = useRef<any>(null)
  const lastFailedAttemptMsRef = useRef<number>(0)

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
    setManualSyncing(true)
    addSyncLog(t('sync.gdriveSyncing'))
    try {
      const r = await store.gdriveSyncNow()
      if (r) {
        setSyncMsg(`+${r.applied}`)
        setLastSync(new Date().toISOString())
        setSyncError(null)
        addSyncLog(t('sync.gdriveSynced').replace('{applied}', r.applied).replace('{outdated}', r.outdated).replace('{uploaded}', r.uploaded))
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      setSyncMsg(t('sync.gdriveError'))
      setSyncError(msg)
      addSyncLog(`${t('sync.gdriveError')}: ${msg}`)
    } finally {
      syncInProgressRef.current = false
      setManualSyncing(false)
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

  // Focus-based auto-sync: trigger when the app regains visibility (tab switch,
  // window focus, return from background). Independent from the change-debounced
  // auto-sync above — controlled by the `auto_sync_on_focus` meta key.
  // Throttled to one sync per FOCUS_SYNC_THROTTLE_MS, with a separate cooldown
  // for failed attempts so we don't hammer the API while offline.
  const FOCUS_SYNC_THROTTLE_MS = 5 * 60 * 1000 // 5 minutes
  const FOCUS_SYNC_ERROR_COOLDOWN_MS = 30 * 1000 // 30 seconds
  const focusSyncEnabled = store.metaSettings?.auto_sync_on_focus !== 'false'
  useEffect(() => {
    if (!focusSyncEnabled || !gdriveConnected || !store.gdriveSyncNow) return

    const tryFocusSync = async () => {
      if (syncInProgressRef.current) return
      const now = Date.now()
      const lastSuccessMs = lastSync ? new Date(lastSync).getTime() : 0
      if (now - lastSuccessMs < FOCUS_SYNC_THROTTLE_MS) return
      if (now - lastFailedAttemptMsRef.current < FOCUS_SYNC_ERROR_COOLDOWN_MS) return
      syncInProgressRef.current = true
      setAutoSyncing(true)
      try { await handleSyncNow() }
      catch { lastFailedAttemptMsRef.current = Date.now() }
      finally {
        syncInProgressRef.current = false
        setAutoSyncing(false)
      }
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') tryFocusSync() }
    const onFocus = () => tryFocusSync()
    const onPageShow = () => tryFocusSync()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [focusSyncEnabled, gdriveConnected, store.gdriveSyncNow, handleSyncNow, lastSync])

  return {
    gdriveConnected, setGdriveConnected,
    showGdriveSetup, setShowGdriveSetup,
    gdriveClientId, setGdriveClientId,
    gdriveClientSecret, setGdriveClientSecret,
    autoSyncing,
    manualSyncing,
    syncError,
    syncMsg, setSyncMsg,
    syncLog, addSyncLog, setSyncLog,
    lastSync, setLastSync,
    handleSyncNow,
  }
}
