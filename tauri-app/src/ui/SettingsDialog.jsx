/**
 * @file SettingsDialog.jsx
 * Full-screen modal settings dialog with tabbed navigation.
 * Includes General, Appearance, AI, Import, Export, About, Maintenance, and Danger tabs.
 */

import { useState, useEffect } from "react";
import { useApp } from "./AppContext";
import {
  Settings, Globe, Sun, Moon, Monitor, Upload, Download,
  Trash2, Info, HardDrive, FolderOpen, Copy, ExternalLink,
  X, Zap, AlertTriangle, RefreshCw,
  Plus, Pencil, Trash, CheckSquare, ListTodo, Tag, Users, Workflow, StickyNote, Cog,
} from "lucide-react";
import { Combobox } from "./Combobox";
import { FONTS, DATE_FORMATS, CSV_FIELDS } from "../core/constants";
import { COLOR_THEMES } from "../core/themes";
import { LOCALE_NAMES } from "../i18n/locales";
import { themeOptions, AutoThemeIcon } from "./icons";

export function SettingRow({ label, description, children }) {
  const { TC } = useApp();
  return (
    <div className="flex flex-col gap-2 py-3">
      <div>
        <div className={`text-sm font-medium ${TC.text}`}>{label}</div>
        {description && <div className={`text-xs mt-0.5 ${TC.textMuted}`}>{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsDialog({ onClose, onTriggerRtmImport, tasks, onClearAll, dbPath, onRevealDb, onOpenDb, onCreateNewDb, onMoveDb, onRestartGuide, onCreateBackup, onListBackups, onRestoreBackup, onExportSyncRequest, onHandleSyncRequest, onImportSyncClipboard, onGetSyncLog, onGetSyncStats, onClearSyncData }) {
  const { t, locale, setLocale, theme, setTheme, TC, settings, updateSetting } = useApp();
  const [activeTab, setActiveTab] = useState("general");
  const [clearStep, setClearStep] = useState(0);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [csvFields, setCsvFields] = useState(() => new Set(CSV_FIELDS.map(f => f.key)));
  const [pathCopied, setPathCopied] = useState(false);
  const [backups, setBackups] = useState(null); // null = not loaded, [] = empty
  const [syncStatus, setSyncStatus] = useState(null); // null | string
  const [syncInput, setSyncInput] = useState(""); // textarea content
  const [syncPreview, setSyncPreview] = useState(null); // parsed preview

  useEffect(() => {
    if (activeTab === "maintenance" && backups === null && onListBackups) {
      onListBackups().then(setBackups);
    }
  }, [activeTab, backups, onListBackups]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs = [
    { key: "general",    label: t("settings.tab.general"),    Icon: Settings,       danger: false },
    { key: "appearance", label: t("settings.tab.appearance"), Icon: Sun,            danger: false },
    { key: "ai",         label: t("settings.tab.ai"),         Icon: Zap,            danger: false },
    { key: "import",     label: t("settings.tab.import"),     Icon: Upload,         danger: false },
    { key: "export",     label: t("settings.tab.export"),     Icon: Download,       danger: false },
    { key: "sync",         label: t("settings.tab.sync"),         Icon: RefreshCw,     danger: false },
    { key: "about",        label: t("settings.tab.about"),        Icon: Info,          danger: false },
    { key: "maintenance",  label: t("settings.tab.maintenance"),  Icon: HardDrive,     danger: false },
    { key: "danger",       label: t("settings.tab.danger"),       Icon: AlertTriangle, danger: true  },
  ];

  const exportCSV = async () => {
    const fields = CSV_FIELDS.filter(f => csvFields.has(f.key));
    const header = fields.map(f => locale === "ru" ? f.labelRu : f.labelEn).join(",");
    const rows = tasks.map(task => {
      return fields.map(f => {
        const v = task[f.key];
        if (v == null) return "";
        if (Array.isArray(v)) {
          const s = v.join("; ").replace(/"/g, '""');
          return `"${s}"`;
        }
        const s = String(v).replace(/"/g, '""');
        return (s.includes(",") || s.includes("\n") || s.includes('"')) ? `"${s}"` : s;
      }).join(",");
    });
    const bom = "\uFEFF";
    const csv = bom + [header, ...rows].join("\n");

    // File System Access API — works in Tauri's WebView2 and modern browsers;
    // opens a native "Save as…" dialog which is the right UX for a desktop app.
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "tasks.csv",
          types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(csv);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user dismissed the dialog
        // unexpected error — fall through to the legacy method
      }
    }

    // Fallback: anchor-click download (works in regular browsers)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tasks.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCsvField = (key, checked) => {
    setCsvFields(prev => { const n = new Set(prev); checked ? n.add(key) : n.delete(key); return n; });
  };

  const renderGeneral = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.general.title")}</h2>
      <div className={`divide-y ${TC.borderClass}`}>
        <SettingRow label={t("settings.general.language")}>
          <div className="flex gap-1.5">
            {Object.entries(LOCALE_NAMES).map(([code, name]) => (
              <button key={code} onClick={() => setLocale(code)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${locale === code ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {name}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.firstDay")}>
          <div className="flex gap-1.5">
            {[{ v: 1, l: t("settings.general.firstDay.monday") }, { v: 0, l: t("settings.general.firstDay.sunday") }].map(opt => (
              <button key={opt.v} onClick={() => updateSetting("firstDayOfWeek", opt.v)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.firstDayOfWeek === opt.v ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {opt.l}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.dateFormat")}>
          <select value={settings.dateFormat} onChange={e => updateSetting("dateFormat", e.target.value)}
            className={`border rounded px-2 py-1.5 text-sm outline-none focus:border-sky-500 ${TC.input} ${TC.inputText}`}>
            {DATE_FORMATS.map(f => (
              <option key={f} value={f}>{t("settings.general.dateFormat." + f)}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label={t("sb.clockFormat")}>
          <div className="flex gap-1.5">
            {["24h", "12h"].map(fmt => (
              <button key={fmt} onClick={() => updateSetting("clockFormat", fmt)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.clockFormat === fmt ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {fmt}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.newTaskActiveToday")}>
          <button onClick={() => updateSetting("newTaskActiveToday", !settings.newTaskActiveToday)}
            className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.newTaskActiveToday ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
            {settings.newTaskActiveToday ? "ON" : "OFF"}
          </button>
        </SettingRow>
        <SettingRow label={t("guide.restart")}>
          <button onClick={() => { onRestartGuide?.(); onClose(); }}
            className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}>
            {t("guide.restart")}
          </button>
        </SettingRow>
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.appearance.title")}</h2>
      <div className={`divide-y ${TC.borderClass}`}>
        <SettingRow label={t("settings.appearance.theme")}>
          <div className="flex gap-1.5">
            {themeOptions.map(({ key, Icon }) => (
              <button key={key} onClick={() => setTheme(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors font-medium ${theme === key ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                <Icon size={13} />{t("footer.theme." + key)}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.colorTheme")}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLOR_THEMES).map(([key, themeData]) => {
              const active = (settings.colorTheme || "default") === key;
              return (
                <button key={key} onClick={() => updateSetting("colorTheme", key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors font-medium border ${
                    active
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : `${TC.elevated} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`
                  }`}>
                  <span className="flex gap-0.5">
                    {themeData.swatches.map((color, i) => (
                      <span key={i} style={{ background: color }}
                        className="inline-block w-3 h-3 rounded-full" />
                    ))}
                  </span>
                  {t("settings.appearance.colorTheme." + key)}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.font")}
          description={t("settings.appearance.fontHint")}>
          <div className="flex items-center gap-2">
            <Combobox
              value={settings.fontFamily}
              onChange={v => updateSetting("fontFamily", v)}
              options={FONTS.filter(f => f.value)}
              placeholder={t("settings.appearance.fontSystem")}
              className={`border rounded px-2 py-1.5 text-sm outline-none focus:border-sky-500 w-56 ${TC.input} ${TC.inputText}`}
              style={{ fontFamily: settings.fontFamily || undefined }}
            />
            {settings.fontFamily && (
              <button onClick={() => updateSetting("fontFamily", "")}
                className={`p-1.5 rounded transition-colors flex-shrink-0 ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}
                title={t("settings.appearance.fontReset")}>
                <X size={14} />
              </button>
            )}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.fontSize")}>
          <div className="flex gap-1.5">
            {["normal", "bigger", "biggest"].map(size => (
              <button key={size} onClick={() => updateSetting("fontSize", size)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.fontSize === size ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {t("settings.appearance.fontSize." + size)}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.condense")}>
          <div className="flex gap-1.5">
            {[{ v: false, k: "off" }, { v: true, k: "on" }].map(opt => (
              <button key={opt.k} onClick={() => updateSetting("condense", opt.v)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.condense === opt.v ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {t("settings.appearance.condense." + opt.k)}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>
    </div>
  );

  const renderAI = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.ai.title")}</h2>
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${TC.borderClass} ${TC.surfaceAlt}`}>
        <Zap size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
        <p className={`text-sm ${TC.textSec}`}>{t("settings.ai.comingSoon")}</p>
      </div>
    </div>
  );

  const renderImport = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.import.title")}</h2>
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.import.rtm")}</div>
        <div className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.import.rtmDesc")}</div>
        <button
          onClick={() => { onClose(); setTimeout(onTriggerRtmImport, 100); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm transition-colors">
          <Upload size={14} />{t("settings.import.rtmBtn")}
        </button>
      </div>
    </div>
  );

  const renderExport = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.export.title")}</h2>
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.export.csv")}</div>
        <div className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.export.csvDesc")}</div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>{t("settings.export.fields")}</div>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mb-4">
          {CSV_FIELDS.map(f => (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={csvFields.has(f.key)}
                onChange={e => toggleCsvField(f.key, e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer" />
              <span className={`text-xs ${TC.textSec} group-hover:text-gray-200 transition-colors`}>
                {locale === "ru" ? f.labelRu : f.labelEn}
              </span>
            </label>
          ))}
        </div>
        <button onClick={exportCSV} disabled={csvFields.size === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${csvFields.size > 0 ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}>
          <Download size={14} />{t("settings.export.csvBtn")}
        </button>
      </div>
    </div>
  );

  const renderAbout = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.about.title")}</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <div className={`font-semibold ${TC.text}`}>Task Orchestrator</div>
            <div className={`text-xs ${TC.textMuted}`}>{t("settings.about.version")} 1.1.0</div>
          </div>
        </div>
        <p className={`text-sm leading-relaxed ${TC.textSec}`}>{t("settings.about.description")}</p>
      </div>
    </div>
  );

  // ── Sync tab state ─────────────────────────────────────────────────────────
  const [syncLog, setSyncLog] = useState(null);
  const [syncStats, setSyncStats] = useState(null);

  useEffect(() => {
    if (activeTab === "sync") {
      onGetSyncStats?.().then(setSyncStats);
      onGetSyncLog?.().then(setSyncLog);
    }
  }, [activeTab]);

  const reloadSync = async () => {
    setSyncStats(await onGetSyncStats?.());
    setSyncLog(await onGetSyncLog?.());
  };

  const ENTITY_ICONS = {
    tasks: CheckSquare, notes: StickyNote, lists: ListTodo,
    tags: Tag, flows: Workflow, personas: Users,
    flow_meta: Workflow, meta: Cog,
  };
  const ACTION_COLORS = {
    insert: "bg-emerald-500/20 text-emerald-400",
    update: "bg-sky-500/20 text-sky-400",
    delete: "bg-red-500/20 text-red-400",
  };
  const ACTION_ICONS = { insert: Plus, update: Pencil, delete: Trash };

  const renderSync = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("sync.title")}</h2>
      <p className={`text-xs mb-4 ${TC.textMuted}`}>{t("sync.desc")}</p>

      {/* Actions */}
      <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
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
                      const result = await onHandleSyncRequest(req);
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
                      const result = await onImportSyncClipboard(pkg);
                      if (result === null) { setSyncStatus(t("sync.clipboardNotSync")); return; }
                      setSyncStatus(
                        result.responseCount > 0
                          ? t("sync.appliedWithResponse")
                              .replace("{applied}", result.applied)
                              .replace("{conflicts}", result.conflicts)
                              .replace("{responseCount}", result.responseCount)
                          : t("sync.appliedNoResponse")
                              .replace("{applied}", result.applied)
                              .replace("{conflicts}", result.conflicts)
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
                  <div key={dev}>{dev.slice(0, 8)}… = {cnt}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delta log */}
      <div className={`rounded-lg border ${TC.elevated} ${TC.borderClass}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${TC.borderClass}`}>
          <div className={`text-sm font-medium ${TC.text}`}>{t("sync.deltaLog")}</div>
          {syncLog?.length > 0 && (
            <button
              onClick={async () => {
                if (confirm(t("sync.clearConfirm"))) {
                  await onClearSyncData?.();
                  await reloadSync();
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors text-red-400 hover:bg-red-500/10`}>
              <Trash size={10} />
              {t("sync.clearLog")}
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
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
      </div>
    </div>
  );

  const renderMaintenance = () => {
    const copyPath = () => {
      if (!dbPath) return;
      navigator.clipboard.writeText(dbPath).then(() => {
        setPathCopied(true);
        setTimeout(() => setPathCopied(false), 1500);
      });
    };
    return (
      <div>
        <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.maintenance.title")}</h2>

        {/* Current path */}
        <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>
            {t("settings.maintenance.currentDb")}
          </div>
          <div className={`text-xs break-all font-mono mb-3 ${TC.textSec}`}>{dbPath || "…"}</div>
          <div className="flex gap-2">
            <button onClick={copyPath}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
              <Copy size={12} />
              {pathCopied ? t("settings.maintenance.copied") : t("settings.maintenance.copyPath")}
            </button>
            {onRevealDb && (
              <button onClick={onRevealDb}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                <FolderOpen size={12} />
                {t("settings.maintenance.reveal")}
              </button>
            )}
          </div>
        </div>

        {/* Open / Create DB */}
        {(onOpenDb || onCreateNewDb) && (
          <div className={`rounded-lg border p-4 mb-3 ${TC.elevated} ${TC.borderClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("settings.maintenance.open.label")}</div>
                <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.open.desc")}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {onOpenDb && (
                  <button onClick={() => { onOpenDb(); onClose(); }}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    {t("settings.maintenance.open.btn")}
                  </button>
                )}
                {onCreateNewDb && (
                  <button onClick={() => { onCreateNewDb(); onClose(); }}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    {t("settings.maintenance.create.btn")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Move DB */}
        {onMoveDb && (
          <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("settings.maintenance.move.label")}</div>
                <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.move.desc")}</div>
              </div>
              <button onClick={() => { onMoveDb(); onClose(); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                {t("settings.maintenance.move.btn")}
              </button>
            </div>
          </div>
        )}

        {/* Backups */}
        <div className={`rounded-lg border p-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("backup.title")}</div>
          <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("backup.desc")}</div>
          <button
            onClick={async () => {
              const ok = await onCreateBackup?.();
              if (ok) { setBackups(null); /* reload list */ }
            }}
            className={`mb-3 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
            {t("backup.create")}
          </button>
          {backups === null ? (
            <div className={`text-xs ${TC.textMuted}`}>…</div>
          ) : backups.length === 0 ? (
            <div className={`text-xs ${TC.textMuted}`}>{t("backup.empty")}</div>
          ) : (
            <div className="space-y-2">
              {backups.map(b => (
                <div key={b.name} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${TC.surface} ${TC.borderClass}`}>
                  <div>
                    <div className={`text-xs font-medium ${TC.text}`}>{b.date}</div>
                    <div className={`text-[10px] ${TC.textMuted}`}>{t("backup.schema")}{b.schemaVersion}</div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(t("backup.confirmRestore"))) {
                        onRestoreBackup?.(b.path);
                        onClose();
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    {t("backup.restore")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDanger = () => (
    <div>
      <h2 className="text-base font-semibold mb-4 text-red-400">{t("settings.danger.title")}</h2>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.danger.clearAll")}</div>
            <div className={`text-xs ${TC.textMuted}`}>{t("settings.danger.clearAllDesc")}</div>
          </div>
        </div>
        {clearStep === 0 && (
          <button onClick={() => setClearStep(1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm transition-colors">
            <Trash2 size={14} />{t("settings.danger.clearBtn")}
          </button>
        )}
        {clearStep === 1 && (
          <div className="space-y-3 mt-2">
            <div className={`text-sm font-medium ${TC.text}`}>{t("settings.danger.confirm1")}</div>
            <div>
              <div className={`text-xs mb-1.5 ${TC.textMuted}`}>{t("settings.danger.confirm2")}</div>
              <input value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="DELETE"
                className={`border rounded px-2 py-1.5 text-sm w-40 outline-none focus:border-red-500 ${TC.input} ${TC.inputText}`} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (clearConfirmText === "DELETE") {
                    onClearAll();
                    setClearStep(0);
                    setClearConfirmText("");
                    onClose();
                  }
                }}
                disabled={clearConfirmText !== "DELETE"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${clearConfirmText === "DELETE" ? "bg-red-600 hover:bg-red-500 text-white" : "opacity-40 bg-gray-700 text-gray-400 cursor-not-allowed"}`}>
                {t("settings.danger.confirmBtn")}
              </button>
              <button
                onClick={() => { setClearStep(0); setClearConfirmText(""); }}
                className={`px-3 py-1.5 rounded text-sm ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200 transition-colors`}>
                {t("settings.danger.cancelBtn")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "general":    return renderGeneral();
      case "appearance": return renderAppearance();
      case "ai":         return renderAI();
      case "import":     return renderImport();
      case "export":     return renderExport();
      case "sync":         return renderSync();
      case "about":        return renderAbout();
      case "maintenance":  return renderMaintenance();
      case "danger":       return renderDanger();
      default:           return null;
    }
  };

  const normalTabs  = tabs.filter(t => !t.danger);
  const dangerTabs  = tabs.filter(t => t.danger);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 flex rounded-xl shadow-2xl border overflow-hidden ${TC.surface} ${TC.borderClass}`}
           style={{ width: 720, maxHeight: "85vh" }}>

        {/* ── Left navigation ── */}
        <div className={`w-48 flex-shrink-0 border-r flex flex-col ${TC.borderClass} ${TC.surfaceAlt}`}>
          <div className={`px-4 py-4 text-xs font-semibold uppercase tracking-widest ${TC.textMuted}`}>
            {t("settings.title")}
          </div>
          <nav className="flex-1 flex flex-col px-2 pb-2 gap-0.5">
            {normalTabs.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                  activeTab === key ? "bg-sky-600/20 text-sky-400" : `${TC.textSec} ${TC.hoverBg} hover:text-gray-200`
                }`}>
                <Icon size={14} className="flex-shrink-0" />{label}
              </button>
            ))}
            <div className="flex-1" />
            <div className={`my-2 border-t ${TC.borderClass}`} />
            {dangerTabs.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                  activeTab === key ? "bg-red-500/20 text-red-400" : `text-red-400/70 ${TC.hoverBg} hover:text-red-400`
                }`}>
                <Icon size={14} className="flex-shrink-0" />{label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right content ── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="p-6">{renderContent()}</div>
        </div>

        {/* ── Close button ── */}
        <button onClick={onClose}
          className={`absolute top-3 right-3 p-1.5 rounded transition-colors ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
