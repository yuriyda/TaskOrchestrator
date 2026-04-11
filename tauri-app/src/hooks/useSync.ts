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

  return {
    gdriveConnected, gdriveLog, setGdriveLog, addGdriveLog,
    wrappedSyncNow, autoSyncing, autoSyncTimerRef,
  };
}
