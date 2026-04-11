/**
 * @file SettingsDialog.tsx
 * Full-screen modal settings dialog with tabbed navigation.
 * Includes General, Appearance, AI, Import, Export, About, Maintenance, and Danger tabs.
 */

import { useState, useEffect, type ReactNode } from "react";
import { useApp } from "./AppContext";
import {
  Settings, Sun, Upload, Download,
  Info, HardDrive, X, Zap, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Combobox } from "./Combobox";
import { FONTS, DATE_FORMATS } from "../core/constants";
import { COLOR_THEMES } from "../core/themes";
import { LOCALE_NAMES } from "../i18n/locales";
import { themeOptions, AutoThemeIcon } from "./icons";
import { ExportTab } from "./settings/ExportTab";
import { SyncTab } from "./settings/SyncTab";
import { MaintenanceTab } from "./settings/MaintenanceTab";
import { DangerTab } from "./settings/DangerTab";
import type { Task, BackupInfo } from "../types";

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
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

interface SettingsDialogProps {
  initialTab?: string;
  onClose: () => void;
  onTriggerRtmImport: () => void;
  tasks: Task[];
  filteredTasks: Task[];
  hasActiveFilter: boolean;
  onClearAll: () => Promise<void>;
  dbPath?: string;
  onRevealDb?: () => void;
  onOpenDb?: () => Promise<void>;
  onCreateNewDb?: () => Promise<void>;
  onMoveDb?: () => Promise<void>;
  onRestartGuide: () => void;
  onCreateBackup?: () => Promise<boolean>;
  onListBackups?: () => Promise<BackupInfo[]>;
  onRestoreBackup?: (path: string) => Promise<void>;
  onExportSyncRequest?: () => Promise<string>;
  onHandleSyncRequest?: (request: string) => Promise<string>;
  onImportSyncClipboard?: () => Promise<any>;
  onGetSyncLog?: () => Promise<any[]>;
  onGetSyncStats?: () => Promise<any>;
  onClearSyncData?: () => Promise<void>;
  onGdriveCheckConnection?: () => Promise<boolean>;
  onGdriveConnect?: (clientId: string, clientSecret: string) => Promise<void>;
  onGdriveDisconnect?: () => Promise<void>;
  onGdriveSyncNow?: () => Promise<any>;
  onGdriveGetConfig?: () => Promise<any>;
  onGdriveCheckSyncFile?: () => Promise<any>;
  onGdrivePurgeSyncFile?: () => Promise<void>;
  onGdriveReadSyncFile?: () => Promise<string>;
  gdriveLog: string[];
  onGdriveLog: (msg: string) => void;
}

export function SettingsDialog({ initialTab, onClose, onTriggerRtmImport, tasks, filteredTasks, hasActiveFilter, onClearAll, dbPath, onRevealDb, onOpenDb, onCreateNewDb, onMoveDb, onRestartGuide, onCreateBackup, onListBackups, onRestoreBackup, onExportSyncRequest, onHandleSyncRequest, onImportSyncClipboard, onGetSyncLog, onGetSyncStats, onClearSyncData, onGdriveCheckConnection, onGdriveConnect, onGdriveDisconnect, onGdriveSyncNow, onGdriveGetConfig, onGdriveCheckSyncFile, onGdrivePurgeSyncFile, onGdriveReadSyncFile, gdriveLog, onGdriveLog }: SettingsDialogProps) {
  const { t, locale, setLocale, theme, setTheme, TC, settings, updateSetting } = useApp();
  const [activeTab, setActiveTab] = useState(initialTab || "general");
  // gdriveConnected is shared between SyncTab and DangerTab — kept in parent
  const [gdriveConnected, setGdriveConnected] = useState(false);

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

  // Export, Sync, Maintenance, Danger tabs extracted to ui/settings/*.tsx

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
        {/* Day Planner settings */}
        <SettingRow
          label={t("planner.dayStart")}
          description={locale === "ru" ? "Час начала сетки планера" : "Planner grid start hour"}>
          <select
            value={settings.plannerDayStart ?? 9}
            onChange={e => updateSetting("plannerDayStart", parseInt(e.target.value))}
            className={`px-2 py-1 rounded text-sm ${TC.input} ${TC.borderClass} border`}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          label={t("planner.dayEnd")}
          description={locale === "ru" ? "Час окончания сетки планера" : "Planner grid end hour"}>
          <select
            value={settings.plannerDayEnd ?? 17}
            onChange={e => updateSetting("plannerDayEnd", parseInt(e.target.value))}
            className={`px-2 py-1 rounded text-sm ${TC.input} ${TC.borderClass} border`}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow
          label={t("planner.slotStep")}
          description={locale === "ru" ? "Минимальный шаг сетки планера" : "Planner grid snap step"}>
          <select
            value={settings.plannerSlotStep ?? 30}
            onChange={e => updateSetting("plannerSlotStep", parseInt(e.target.value))}
            className={`px-2 py-1 rounded text-sm ${TC.input} ${TC.borderClass} border`}
          >
            <option value={15}>15 {t("planner.minutes")}</option>
            <option value={30}>30 {t("planner.minutes")}</option>
            <option value={60}>60 {t("planner.minutes")}</option>
          </select>
        </SettingRow>

        <SettingRow
          label={locale === "ru" ? "Извлекать URL из названия" : "Auto-extract URL from title"}
          description={locale === "ru" ? "Автоматически переносить ссылку из названия задачи в поле URL" : "Automatically move links from task title to the URL field"}>
          <button onClick={() => updateSetting("autoExtractUrl", settings.autoExtractUrl === false ? true : false)}
            className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.autoExtractUrl !== false ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
            {settings.autoExtractUrl !== false ? "ON" : "OFF"}
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
            <div className={`text-xs ${TC.textMuted}`}>{t("settings.about.version")} {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</div>
          </div>
        </div>
        <p className={`text-sm leading-relaxed ${TC.textSec}`}>{t("settings.about.description")}</p>
      </div>
    </div>
  );

  // Load Google Drive config on mount (shared state for SyncTab + DangerTab)
  useEffect(() => {
    onGdriveGetConfig?.().then(cfg => {
      if (cfg) {
        setGdriveConnected(cfg.hasToken);
      }
    });
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "general":    return renderGeneral();
      case "appearance": return renderAppearance();
      case "ai":         return renderAI();
      case "import":     return renderImport();
      case "export":     return <ExportTab tasks={tasks} filteredTasks={filteredTasks} hasActiveFilter={hasActiveFilter} />;
      case "sync":       return <SyncTab gdriveConnected={gdriveConnected} setGdriveConnected={setGdriveConnected}
                           onExportSyncRequest={onExportSyncRequest} onHandleSyncRequest={onHandleSyncRequest}
                           onImportSyncClipboard={onImportSyncClipboard} onGetSyncLog={onGetSyncLog} onGetSyncStats={onGetSyncStats}
                           onClearSyncData={onClearSyncData} onGdriveConnect={onGdriveConnect} onGdriveDisconnect={onGdriveDisconnect}
                           onGdriveSyncNow={onGdriveSyncNow} onGdriveGetConfig={onGdriveGetConfig} onGdriveReadSyncFile={onGdriveReadSyncFile}
                           gdriveLog={gdriveLog} onGdriveLog={onGdriveLog} />;
      case "about":      return renderAbout();
      case "maintenance": return <MaintenanceTab dbPath={dbPath} onRevealDb={onRevealDb} onOpenDb={onOpenDb}
                            onCreateNewDb={onCreateNewDb} onMoveDb={onMoveDb} onCreateBackup={onCreateBackup}
                            onListBackups={onListBackups} onRestoreBackup={onRestoreBackup} onClose={onClose} />;
      case "danger":     return <DangerTab gdriveConnected={gdriveConnected} onClearAll={onClearAll}
                           onGdriveCheckSyncFile={onGdriveCheckSyncFile} onGdrivePurgeSyncFile={onGdrivePurgeSyncFile} onClose={onClose} />;
      default:           return null;
    }
  };

  const normalTabs  = tabs.filter(t => !t.danger);
  const dangerTabs  = tabs.filter(t => t.danger);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
           onMouseDown={e => { if (e.target === e.currentTarget) e.currentTarget.dataset.bd = "1"; }}
           onClick={e => { if (e.currentTarget.dataset.bd) { delete e.currentTarget.dataset.bd; onClose(); } }} />
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
