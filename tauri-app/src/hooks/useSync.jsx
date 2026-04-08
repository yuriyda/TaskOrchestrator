/**
 * @file useSync.jsx
 * @description Custom hook for Google Drive sync: connection state, sync logging,
 *   manual/auto sync triggers with debounce. Extracted from task-orchestrator.jsx.
 */
import { useState, useRef, useEffect, useCallback } from "react";

export function useSync(store, tasks, locale, t, settings) {
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveLog, setGdriveLog] = useState([]);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSyncTimerRef = useRef(null);
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    store.gdriveCheckConnection?.().then(ok => setGdriveConnected(!!ok));
  }, [store, store.metaSettings]);

  const addGdriveLog = (msg) => {
    const ts = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setGdriveLog(prev => [...prev, `[${ts}] ${msg}`]);
  };

  const handleSyncNow = store.gdriveSyncNow ? async () => {
    addGdriveLog(t("sync.gdriveSyncing"));
    const result = await store.gdriveSyncNow();
    if (result) {
      addGdriveLog(
        t("sync.gdriveSynced")
          .replace("{applied}", result.applied)
          .replace("{outdated}", result.outdated)
          .replace("{uploaded}", result.uploaded)
      );
    }
    return result;
  } : undefined;

  const wrappedSyncNow = useCallback(async () => {
    if (!handleSyncNow) return;
    syncInProgressRef.current = true;
    try { return await handleSyncNow(); }
    finally { syncInProgressRef.current = false; }
  }, [handleSyncNow]);

  const triggerAutoSync = useCallback(() => {
    if (!handleSyncNow || settings.autoSync === false) return;
    if (!gdriveConnected) return;
    if (syncInProgressRef.current) return;
    clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(async () => {
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      setAutoSyncing(true);
      try { await handleSyncNow(); } catch {}
      syncInProgressRef.current = false;
      setAutoSyncing(false);
    }, 3000);
  }, [handleSyncNow, settings.autoSync, gdriveConnected]);

  // Trigger auto-sync whenever tasks change (debounced), skip if sync caused the change
  const prevTasksRef = useRef(tasks);
  useEffect(() => {
    if (prevTasksRef.current !== tasks && prevTasksRef.current.length > 0 && !syncInProgressRef.current) {
      triggerAutoSync();
    }
    prevTasksRef.current = tasks;
  }, [tasks, triggerAutoSync]);

  return {
    gdriveConnected, gdriveLog, setGdriveLog, addGdriveLog,
    wrappedSyncNow, autoSyncing, autoSyncTimerRef,
  };
}
