/**
 * @file useSync.ts
 * @description Custom hook for Google Drive sync: connection state, sync logging,
 *   manual/auto sync triggers with debounce.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { SYNC_COOLDOWN_MS, AUTO_SYNC_DELAY_MS } from "../core/constants";
import type { Task } from "../types";
import type { AppSettings } from "./useSettings";

interface SyncResult {
  applied: number;
  outdated: number;
  uploaded: number;
}

export function useSync(
  store: any,
  tasks: Task[],
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  settings: AppSettings,
) {
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveLog, setGdriveLog] = useState<string[]>([]);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInProgressRef = useRef(false);
  const syncCooldownRef = useRef(false);

  useEffect(() => {
    (async () => {
      const ok = await store.gdriveCheckConnection?.();
      setGdriveConnected(!!ok);
    })();
  }, [store, store.metaSettings]);

  const addGdriveLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setGdriveLog(prev => [...prev, `[${ts}] ${msg}`]);
  };

  const handleSyncNow = store.gdriveSyncNow ? async (): Promise<SyncResult | undefined> => {
    addGdriveLog(t("sync.gdriveSyncing"));
    try {
      const result: SyncResult | undefined = await store.gdriveSyncNow();
      if (result) {
        addGdriveLog(
          t("sync.gdriveSynced")
            .replace("{applied}", String(result.applied))
            .replace("{outdated}", String(result.outdated))
            .replace("{uploaded}", String(result.uploaded))
        );
      }
      return result;
    } catch (err: any) {
      const msg = err?.message || err?.toString?.() || String(err);
      addGdriveLog(`${t("sync.gdriveError")}: ${msg}`);
      console.error("[sync] Error:", err);
      throw err; // re-throw so StatusBar shows red icon
    }
  } : undefined;

  const wrappedSyncNow = useCallback(async () => {
    if (!handleSyncNow) return;
    syncInProgressRef.current = true;
    try { return await handleSyncNow(); }
    finally {
      syncInProgressRef.current = false;
      // Suppress auto-sync triggered by task state update after manual sync
      syncCooldownRef.current = true;
      setTimeout(() => { syncCooldownRef.current = false; }, SYNC_COOLDOWN_MS);
    }
  }, [handleSyncNow]);

  const triggerAutoSync = useCallback(() => {
    if (!handleSyncNow || settings.autoSync === false) return;
    if (!gdriveConnected) return;
    if (syncInProgressRef.current) return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(async () => {
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      setAutoSyncing(true);
      try { await handleSyncNow(); } catch { /* error already logged in handleSyncNow */ }
      syncInProgressRef.current = false;
      setAutoSyncing(false);
    }, AUTO_SYNC_DELAY_MS);
  }, [handleSyncNow, settings.autoSync, gdriveConnected]);

  const prevTasksRef = useRef(tasks);
  useEffect(() => {
    if (prevTasksRef.current !== tasks && prevTasksRef.current.length > 0 && !syncInProgressRef.current && !syncCooldownRef.current) {
      triggerAutoSync();
    }
    prevTasksRef.current = tasks;
  }, [tasks, triggerAutoSync]);

  // Focus-based auto-sync: trigger when the window regains focus or visibility.
  // Independent from the change-debounced auto-sync — controlled by the
  // `auto_sync_on_focus` meta key (string 'true'/'false', default true).
  // Throttled to one sync per FOCUS_SYNC_THROTTLE_MS, with a separate
  // cooldown for failed attempts to avoid hammering the API while offline.
  const FOCUS_SYNC_THROTTLE_MS = 5 * 60 * 1000;
  const FOCUS_SYNC_ERROR_COOLDOWN_MS = 30 * 1000;
  const lastFailedAttemptMsRef = useRef<number>(0);
  const focusSyncEnabled = store.metaSettings?.auto_sync_on_focus !== 'false';
  const lastSync: string | null = store.metaSettings?.last_sync || null;
  useEffect(() => {
    if (!focusSyncEnabled || !handleSyncNow || !gdriveConnected) return;

    const tryFocusSync = async () => {
      if (syncInProgressRef.current) return;
      const now = Date.now();
      const lastSuccessMs = lastSync ? new Date(lastSync).getTime() : 0;
      if (now - lastSuccessMs < FOCUS_SYNC_THROTTLE_MS) return;
      if (now - lastFailedAttemptMsRef.current < FOCUS_SYNC_ERROR_COOLDOWN_MS) return;
      syncInProgressRef.current = true;
      setAutoSyncing(true);
      try { await handleSyncNow(); }
      catch { lastFailedAttemptMsRef.current = Date.now(); }
      finally {
        syncInProgressRef.current = false;
        setAutoSyncing(false);
      }
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') tryFocusSync(); };
    const onFocus = () => tryFocusSync();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [focusSyncEnabled, gdriveConnected, handleSyncNow, lastSync]);

  return {
    gdriveConnected, gdriveLog, setGdriveLog, addGdriveLog,
    wrappedSyncNow, autoSyncing, autoSyncTimerRef,
  };
}
