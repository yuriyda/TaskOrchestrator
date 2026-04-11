/**
 * @file SyncTab.tsx
 * Sync tab for SettingsDialog: Google Drive sync, clipboard sync, device info, delta log.
 * Extracted from SettingsDialog to reduce component size (~400 lines → standalone).
 */
import { useState, useEffect, useRef } from "react";
import {
  ExternalLink, Copy, Download, ChevronDown, Trash,
  Plus, Pencil, CheckSquare, ListTodo, Tag, Users, Workflow, StickyNote, Cog,
} from "lucide-react";
import { useApp } from "../AppContext";
import { SettingRow } from "../SettingsDialog";

interface SyncTabProps {
  gdriveConnected: boolean;
  setGdriveConnected: (v: boolean) => void;
  onExportSyncRequest?: () => Promise<string>;
  onHandleSyncRequest?: (request: any) => Promise<any>;
  onImportSyncClipboard?: (pkg: any) => Promise<any>;
  onGetSyncLog?: () => Promise<any[]>;
  onGetSyncStats?: () => Promise<any>;
  onClearSyncData?: () => Promise<void>;
  onGdriveConnect?: (clientId: string, clientSecret: string) => Promise<void>;
  onGdriveDisconnect?: () => Promise<void>;
  onGdriveSyncNow?: () => Promise<any>;
  onGdriveGetConfig?: () => Promise<any>;
  onGdriveReadSyncFile?: () => Promise<string>;
  gdriveLog: string[];
  onGdriveLog: (msg: string) => void;
}

const ENTITY_ICONS: Record<string, any> = {
  tasks: CheckSquare, notes: StickyNote, lists: ListTodo,
  tags: Tag, flows: Workflow, personas: Users,
  flow_meta: Workflow, meta: Cog,
};
const ACTION_COLORS: Record<string, string> = {
  insert: "bg-emerald-500/20 text-emerald-400",
  update: "bg-sky-500/20 text-sky-400",
  delete: "bg-red-500/20 text-red-400",
};
const ACTION_ICONS: Record<string, any> = { insert: Plus, update: Pencil, delete: Trash };

export function SyncTab({
  gdriveConnected, setGdriveConnected,
  onExportSyncRequest, onHandleSyncRequest, onImportSyncClipboard,
  onGetSyncLog, onGetSyncStats, onClearSyncData,
  onGdriveConnect, onGdriveDisconnect, onGdriveSyncNow, onGdriveGetConfig, onGdriveReadSyncFile,
  gdriveLog, onGdriveLog,
}: SyncTabProps) {
  const { t, locale, TC, settings, updateSetting } = useApp();

  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncInput, setSyncInput] = useState("");
  const [syncPreview, setSyncPreview] = useState<any>(null);
  const [gdriveClientId, setGdriveClientId] = useState("");
  const [gdriveClientSecret, setGdriveClientSecret] = useState("");
  const [gdriveConnectError, setGdriveConnectError] = useState<string | null>(null);
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveSyncing, setGdriveSyncing] = useState(false);
  const [syncFileData, setSyncFileData] = useState<any>(null);
  const [clipboardSyncOpen, setClipboardSyncOpen] = useState(false);
  const [deltaLogOpen, setDeltaLogOpen] = useState(false);
  const [syncLog, setSyncLog] = useState<any[] | null>(null);
  const [syncStats, setSyncStats] = useState<any>(null);
  const gdriveLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onGdriveGetConfig?.().then(cfg => {
      if (cfg) {
        setGdriveConnected(cfg.hasToken);
        if (cfg.clientId) setGdriveClientId(cfg.clientId);
      }
    });
  }, []);

  useEffect(() => {
    onGetSyncStats?.().then(setSyncStats);
    onGetSyncLog?.().then(setSyncLog);
  }, []);

  useEffect(() => {
    if (gdriveLogRef.current) gdriveLogRef.current.scrollTop = gdriveLogRef.current.scrollHeight;
  }, [gdriveLog]);

  const addGdriveLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    (onGdriveLog as any)?.(prev => [...prev, `[${ts}] ${msg}`]);
  };

  const reloadSync = async () => {
    setSyncStats(await onGetSyncStats?.());
    setSyncLog(await onGetSyncLog?.());
  };

  return (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("sync.title")}</h2>
      <p className={`text-xs mb-4 ${TC.textMuted}`}>{t("sync.desc")}</p>

      {/* Google Drive sync */}
      {onGdriveConnect && (
        <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${TC.textMuted}`}>Google Drive</div>
          {!gdriveConnected ? (
            <div className="space-y-2">
              <div className={`text-xs mb-2 ${TC.textMuted}`}>{t("sync.gdriveSetupDesc")}</div>
              <a href="https://github.com/yuriyda/TaskOrchestrator/blob/main/GOOGLE_DRIVE_SETUP.md" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 mb-2">
                <ExternalLink size={10} />
                {locale === "ru" ? "Пошаговая инструкция" : "Step-by-step guide"}
              </a>
              <input type="text" value={gdriveClientId} onChange={e => setGdriveClientId(e.target.value)} placeholder="Client ID"
                className={`w-full px-3 py-1.5 rounded text-xs font-mono border ${TC.surface} ${TC.borderClass} ${TC.textSec} focus:outline-none focus:ring-1 focus:ring-sky-500`} />
              <input type="password" value={gdriveClientSecret} onChange={e => setGdriveClientSecret(e.target.value)} placeholder="Client Secret"
                className={`w-full px-3 py-1.5 rounded text-xs font-mono border ${TC.surface} ${TC.borderClass} ${TC.textSec} focus:outline-none focus:ring-1 focus:ring-sky-500`} />
              <button
                disabled={!gdriveClientId.trim() || !gdriveClientSecret.trim() || gdriveConnecting}
                onClick={async () => {
                  setGdriveConnectError(null);
                  setGdriveConnecting(true);
                  try {
                    await onGdriveConnect!(gdriveClientId.trim(), gdriveClientSecret.trim());
                    setGdriveConnected(true);
                    addGdriveLog(t("sync.gdriveConnected"));
                  } catch (e: any) {
                    const msg = e?.message || String(e);
                    setGdriveConnectError(msg);
                    addGdriveLog(`${t("sync.gdriveError")}: ${msg}`);
                  } finally {
                    setGdriveConnecting(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  gdriveClientId.trim() && gdriveClientSecret.trim() && !gdriveConnecting
                    ? "bg-sky-600 hover:bg-sky-500 text-white"
                    : `${TC.surface} ${TC.textMuted} cursor-not-allowed`
                }`}>
                {gdriveConnecting ? (locale === "ru" ? "Подключение…" : "Connecting…") : t("sync.gdriveConnect")}
              </button>
              {gdriveConnectError && (
                <div className="text-xs text-red-400 mt-1 break-all">
                  {t("sync.gdriveError")}: {gdriveConnectError}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className={`flex-1 text-xs ${TC.textSec}`}>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                  {t("sync.gdriveConnectedStatus")}
                </div>
                <button
                  disabled={gdriveSyncing}
                  onClick={async () => {
                    addGdriveLog(t("sync.gdriveSyncing"));
                    setGdriveSyncing(true);
                    try {
                      const result = await onGdriveSyncNow!();
                      if (result) {
                        addGdriveLog(
                          t("sync.gdriveSynced")
                            .replace("{applied}", result.applied)
                            .replace("{outdated}", result.outdated)
                            .replace("{uploaded}", result.uploaded)
                        );
                      }
                      await reloadSync();
                    } catch (e: any) {
                      addGdriveLog(`${t("sync.gdriveError")}: ${e.message}`);
                    } finally {
                      setGdriveSyncing(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors bg-sky-600 hover:bg-sky-500 text-white">
                  {gdriveSyncing ? t("sync.gdriveSyncing") : t("sync.gdriveSyncNow")}
                </button>
                <button
                  onClick={async () => {
                    await onGdriveDisconnect!();
                    setGdriveConnected(false);
                    setGdriveClientSecret("");
                    addGdriveLog(t("sync.gdriveDisconnected"));
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                  {t("sync.gdriveDisconnect")}
                </button>
              </div>
              {gdriveLog.length > 0 && (
                <div ref={gdriveLogRef} className={`max-h-28 overflow-y-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed ${TC.surface} ${TC.borderClass} ${TC.textMuted}`}>
                  {gdriveLog.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}

              {/* View sync file contents */}
              {onGdriveReadSyncFile && (
                <div className="mt-3">
                  <button
                    onClick={async () => {
                      if (syncFileData && syncFileData !== "loading" && syncFileData !== "empty") {
                        setSyncFileData(null);
                        return;
                      }
                      setSyncFileData("loading");
                      try {
                        const result = await onGdriveReadSyncFile();
                        setSyncFileData(result || "empty");
                      } catch (e: any) {
                        addGdriveLog(`${t("sync.gdriveError")}: ${e.message}`);
                        setSyncFileData(null);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    {syncFileData === "loading" ? "…" : syncFileData && syncFileData !== "empty" ? (locale === "ru" ? "Скрыть содержимое" : "Hide contents") : (locale === "ru" ? "Показать файл синхронизации" : "View sync file")}
                  </button>
                  {syncFileData === "empty" && (
                    <div className={`mt-2 text-xs ${TC.textMuted}`}>{locale === "ru" ? "Файл синхронизации не найден на Google Drive." : "No sync file found on Google Drive."}</div>
                  )}
                  {syncFileData && syncFileData !== "loading" && syncFileData !== "empty" && (
                    <div className="mt-2">
                      <div className={`text-[10px] mb-1 ${TC.textMuted}`}>
                        {syncFileData.file.name} · {new Date(syncFileData.file.modifiedTime).toLocaleString(locale)}
                      </div>
                      <pre className={`max-h-64 overflow-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all ${TC.surface} ${TC.borderClass} ${TC.textMuted}`}>
                        {JSON.stringify(syncFileData.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-sync toggle */}
      <SettingRow
        label={locale === "ru" ? "Автосинхронизация" : "Auto-sync"}
        description={locale === "ru" ? "Синхронизировать после каждого изменения задач (с задержкой 3 сек)" : "Sync after every task change (3 sec debounce)"}>
        <button
          onClick={() => updateSetting("autoSync", !settings.autoSync)}
          className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoSync !== false ? "bg-sky-600" : "bg-gray-600"}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.autoSync !== false ? "left-5" : "left-0.5"}`} />
        </button>
      </SettingRow>

      {/* Clipboard sync — collapsible */}
      <div className={`rounded-lg border mb-4 ${TC.elevated} ${TC.borderClass}`}>
        <button onClick={() => setClipboardSyncOpen(v => !v)}
          className={`w-full flex items-center justify-between p-4 text-left`}>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${TC.textMuted}`}>{t("sync.clipboardTitle")}</span>
          <ChevronDown size={14} className={`transition-transform ${TC.textMuted} ${clipboardSyncOpen ? "rotate-180" : ""}`} />
        </button>
        {clipboardSyncOpen && (
          <div className="px-4 pb-4">
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>{t("sync.phase1")}</div>
            <div className="flex gap-2 mb-3">
              {onExportSyncRequest && (
                <button
                  onClick={async () => {
                    setSyncStatus(null);
                    const result = await onExportSyncRequest();
                    if (result === null) return;
                    setSyncStatus(t("sync.requestCopied"));
                    await reloadSync();
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                  <Copy size={14} />
                  {t("sync.copyRequest")}
                </button>
              )}
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>{t("sync.phase2")}</div>
            {(onHandleSyncRequest || onImportSyncClipboard) && (
              <div className="mb-3">
                <div className="flex gap-2 mb-2">
                  <textarea
                    value={syncInput}
                    onChange={(e) => {
                      setSyncInput(e.target.value);
                      setSyncPreview(null);
                      setSyncStatus(null);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed?.type === "sync_request") {
                          setSyncPreview({ type: "request", deviceId: parsed.deviceId, vcKeys: Object.keys(parsed.vectorClock || {}).length });
                        } else if (parsed?.type === "sync_package") {
                          setSyncPreview({ type: "package", deviceId: parsed.deviceId, tasks: parsed.tasks?.length || 0, notes: parsed.notes?.length || 0 });
                        }
                      } catch {}
                    }}
                    placeholder={t("sync.inputPlaceholder")}
                    className={`flex-1 h-20 px-3 py-2 rounded-lg text-xs font-mono resize-none border ${TC.surface} ${TC.borderClass} ${TC.textSec} focus:outline-none focus:ring-1 focus:ring-sky-500`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (!text || !text.trim()) { setSyncPreview(null); setSyncStatus(t("sync.clipboardEmpty")); return; }
                        setSyncInput(text);
                        let parsed;
                        try { parsed = JSON.parse(text); } catch { setSyncPreview(null); setSyncStatus(t("sync.clipboardNotJson")); return; }
                        if (parsed?.type === "sync_request") {
                          setSyncPreview({ type: "request", deviceId: parsed.deviceId, vcKeys: Object.keys(parsed.vectorClock || {}).length });
                        } else if (parsed?.type === "sync_package") {
                          setSyncPreview({ type: "package", deviceId: parsed.deviceId, tasks: parsed.tasks?.length || 0, notes: parsed.notes?.length || 0 });
                        } else {
                          setSyncPreview(null);
                          setSyncStatus(t("sync.clipboardNotSync"));
                        }
                      } catch { setSyncStatus(t("sync.clipboardEmpty")); }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    <Download size={12} />
                    {t("sync.pasteBtn")}
                  </button>
                  {syncPreview?.type === "request" && (
                    <>
                      <div className={`flex-1 text-xs ${TC.textMuted}`}>
                        {t("sync.previewRequest")
                          .replace("{device}", (syncPreview.deviceId?.slice(0, 8) || "?") + "…")
                          .replace("{devices}", syncPreview.vcKeys)}
                      </div>
                      <button
                        onClick={async () => {
                          setSyncStatus(null);
                          let req;
                          try { req = JSON.parse(syncInput); } catch { setSyncStatus(t("sync.clipboardNotJson")); return; }
                          if (!req || req.type !== "sync_request") { setSyncStatus(t("sync.clipboardNotSync")); return; }
                          const result = await onHandleSyncRequest!(req);
                          if (result === null) return;
                          setSyncStatus(
                            t("sync.packageGenerated")
                              .replace("{tasks}", result.count)
                              .replace("{notes}", result.notesCount)
                          );
                          setSyncInput("");
                          setSyncPreview(null);
                        }}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors bg-amber-600 hover:bg-amber-500 text-white">
                        {t("sync.generatePackage")}
                      </button>
                    </>
                  )}
                  {syncPreview?.type === "package" && (
                    <>
                      <div className={`flex-1 text-xs ${TC.textMuted}`}>
                        {t("sync.preview")
                          .replace("{device}", (syncPreview.deviceId?.slice(0, 8) || "?") + "…")
                          .replace("{tasks}", syncPreview.tasks)
                          .replace("{notes}", syncPreview.notes)}
                      </div>
                      <button
                        onClick={async () => {
                          setSyncStatus(null);
                          let pkg;
                          try { pkg = JSON.parse(syncInput); } catch { setSyncStatus(t("sync.clipboardNotJson")); return; }
                          if (!pkg || pkg.type !== "sync_package") { setSyncStatus(t("sync.clipboardNotSync")); return; }
                          const result = await onImportSyncClipboard!(pkg);
                          if (result === null) { setSyncStatus(t("sync.clipboardNotSync")); return; }
                          setSyncStatus(
                            result.responseCount > 0
                              ? t("sync.appliedWithResponse")
                                  .replace("{applied}", result.applied)
                                  .replace("{outdated}", result.outdated)
                                  .replace("{responseCount}", result.responseCount)
                              : t("sync.appliedNoResponse")
                                  .replace("{applied}", result.applied)
                                  .replace("{outdated}", result.outdated)
                          );
                          setSyncInput("");
                          setSyncPreview(null);
                          await reloadSync();
                        }}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors bg-sky-600 hover:bg-sky-500 text-white">
                        {t("sync.apply")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {syncStatus && (
              <div className={`text-xs px-3 py-2 rounded-md ${TC.surface} ${TC.textMuted}`}>{syncStatus}</div>
            )}
          </div>
        )}
      </div>

      {/* Device info & stats */}
      {syncStats && (
        <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className={`font-semibold uppercase tracking-wider mb-1 ${TC.textMuted}`}>{t("sync.device")}</div>
              <div className={`font-mono text-[11px] ${TC.textSec}`}>{syncStats.deviceId?.slice(0, 12) || "—"}…</div>
            </div>
            <div>
              <div className={`font-semibold uppercase tracking-wider mb-1 ${TC.textMuted}`}>{t("sync.pending")}</div>
              <div className={`text-sm font-bold ${syncStats.pendingCount > 0 ? "text-sky-400" : TC.textSec}`}>
                {syncStats.pendingCount}
              </div>
            </div>
            <div>
              <div className={`font-semibold uppercase tracking-wider mb-1 ${TC.textMuted}`}>{t("sync.totalLog")}</div>
              <div className={`text-sm font-bold ${TC.textSec}`}>{syncStats.totalEntries}</div>
            </div>
            <div>
              <div className={`font-semibold uppercase tracking-wider mb-1 ${TC.textMuted}`}>{t("sync.vectorClock")}</div>
              <div className={`font-mono text-[10px] leading-relaxed ${TC.textSec}`}>
                {Object.entries(syncStats.vectorClock).map(([dev, cnt]) => (
                  <div key={dev}>{dev.slice(0, 8)}… = {String(cnt)}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delta log — collapsible */}
      <div className={`rounded-lg border ${TC.elevated} ${TC.borderClass}`}>
        <button onClick={() => setDeltaLogOpen(v => !v)}
          className={`w-full flex items-center justify-between px-4 py-3`}>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${TC.text}`}>{t("sync.deltaLog")}</span>
            <span className={`text-[10px] font-mono ${TC.textMuted}`}>
              {syncLog?.length || 0} {t("sync.entries")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {deltaLogOpen && syncLog && syncLog.length > 0 && (
              <span
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(t("sync.clearConfirm"))) {
                    await onClearSyncData?.();
                    await reloadSync();
                  }
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors text-red-400 hover:bg-red-500/10`}>
                <Trash size={10} />
                {t("sync.clearLog")}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${TC.textMuted} ${deltaLogOpen ? "rotate-180" : ""}`} />
          </div>
        </button>
        {deltaLogOpen && (
          <div className={`max-h-72 overflow-y-auto border-t ${TC.borderClass}`}>
            {!syncLog || syncLog.length === 0 ? (
              <div className={`px-4 py-6 text-center text-xs ${TC.textMuted}`}>{t("sync.empty")}</div>
            ) : (
              syncLog.map((entry) => {
                const EntityIcon = ENTITY_ICONS[entry.entity] || Cog;
                const ActionIcon = ACTION_ICONS[entry.action] || Pencil;
                const actionCls = ACTION_COLORS[entry.action] || "";
                const label = entry.data?.title || entry.data?.name || entry.data?.key || entry.entityId?.slice(0, 12);
                return (
                  <div key={entry.id} className={`flex items-center gap-3 px-4 py-2 border-b last:border-b-0 ${TC.borderClass} hover:${TC.hoverBg}`}>
                    <EntityIcon size={14} className={TC.textMuted} />
                    <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${actionCls}`}>
                      <ActionIcon size={10} />
                      {t(`sync.action.${entry.action}`)}
                    </div>
                    <div className={`flex-1 text-xs truncate ${TC.textSec}`}>
                      <span className={`font-medium ${TC.text}`}>{t(`sync.entity.${entry.entity}`)}</span>
                      {label && <span className="ml-1.5 opacity-70">{label}</span>}
                    </div>
                    <div className={`text-[10px] font-mono tabular-nums ${TC.textMuted}`}>
                      #{entry.lamportTs}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
