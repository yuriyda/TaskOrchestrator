/**
 * @file MaintenanceTab.tsx
 * Maintenance tab for SettingsDialog: DB path, open/create/move DB, backups.
 * Extracted from SettingsDialog to reduce component size.
 */
import { useState, useEffect } from "react";
import { Copy, FolderOpen, Trash2, Gauge } from "lucide-react";
import { useApp } from "../AppContext";
import { getPerfStats, getPerfGauges } from "../../../../shared/core/perfMeter.js";
import type { BackupInfo } from "../../types";

interface MaintenanceTabProps {
  dbPath?: string;
  onRevealDb?: () => void;
  onOpenDb?: () => Promise<void>;
  onCreateNewDb?: () => Promise<void>;
  onMoveDb?: () => Promise<void>;
  onCreateBackup?: () => Promise<boolean>;
  onListBackups?: () => Promise<BackupInfo[]>;
  onRestoreBackup?: (path: string) => Promise<void>;
  onCleanupLookups?: () => Promise<{ removed: { lists: string[]; tags: string[]; personas: string[]; flows: string[] } }>;
  onClose: () => void;
}

function DiagnosticsTable({ t, TC }: { t: (k: string) => string; TC: any }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(id); }, []);
  void tick; // force re-read each second
  const stats = getPerfStats();
  const gauges = getPerfGauges();
  const labels = Object.keys(stats).sort();
  if (labels.length === 0) return <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.diagnostics.empty")}</div>;
  return (
    <div className="space-y-1">
      {labels.map(label => {
        const s = stats[label];
        const avg = s.count > 0 ? s.totalMs / s.count : 0;
        return (
          <div key={label} className={`grid grid-cols-5 gap-2 text-[11px] font-mono ${TC.textSec}`}>
            <div className="col-span-2 truncate">{label}</div>
            <div>n={s.count}</div>
            <div>avg {avg.toFixed(1)}ms</div>
            <div>max {s.maxMs.toFixed(1)}ms</div>
          </div>
        );
      })}
      {Object.keys(gauges).length > 0 && (
        <div className={`text-[11px] font-mono ${TC.textMuted} pt-1 border-t ${TC.borderClass} mt-1`}>
          {Object.entries(gauges).map(([k, v]) => `${k}=${v}`).join("  ")}
        </div>
      )}
    </div>
  );
}

export function MaintenanceTab({ dbPath, onRevealDb, onOpenDb, onCreateNewDb, onMoveDb, onCreateBackup, onListBackups, onRestoreBackup, onCleanupLookups, onClose }: MaintenanceTabProps) {
  const { t, TC } = useApp();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [pathCopied, setPathCopied] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (backups === null && onListBackups) {
      (async () => { setBackups(await onListBackups()); })();
    }
  }, [backups, onListBackups]);

  const copyPath = async () => {
    if (!dbPath) return;
    await navigator.clipboard.writeText(dbPath);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 1500);
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

      {/* Cleanup unused lookups */}
      {onCleanupLookups && (
        <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("settings.maintenance.cleanupLookups.label")}</div>
              <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.cleanupLookups.desc")}</div>
              {cleanupMsg && <div className={`text-xs mt-2 ${TC.textSec}`}>{cleanupMsg}</div>}
            </div>
            <button
              onClick={async () => {
                setCleaning(true);
                setCleanupMsg(null);
                try {
                  const { removed } = await onCleanupLookups!();
                  const count = removed.lists.length + removed.tags.length + removed.personas.length + removed.flows.length;
                  setCleanupMsg(count === 0
                    ? t("settings.maintenance.cleanupLookups.nothing")
                    : t("settings.maintenance.cleanupLookups.done").replace("{n}", String(count)));
                } finally {
                  setCleaning(false);
                }
              }}
              disabled={cleaning}
              className={`flex items-center gap-1.5 flex-shrink-0 px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg} ${cleaning ? "opacity-50 cursor-wait" : ""}`}>
              <Trash2 size={12} />
              {cleaning ? t("settings.maintenance.cleanupLookups.running") : t("settings.maintenance.cleanupLookups.btn")}
            </button>
          </div>
        </div>
      )}

      {/* Diagnostics — fetchAll perf counter (Task 5 phase C). Read-only, per-session. */}
      <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
        <div className="flex items-center gap-2 mb-2">
          <Gauge size={12} className={TC.textMuted} />
          <div className={`text-sm font-medium ${TC.text}`}>{t("settings.maintenance.diagnostics.label")}</div>
        </div>
        <div className={`text-xs ${TC.textMuted} mb-2`}>{t("settings.maintenance.diagnostics.desc")}</div>
        <DiagnosticsTable t={t} TC={TC} />
      </div>

      {/* Backups */}
      <div className={`rounded-lg border p-4 ${TC.elevated} ${TC.borderClass}`}>
        <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("backup.title")}</div>
        <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("backup.desc")}</div>
        <button
          onClick={async () => {
            const ok = await onCreateBackup?.();
            if (ok && onListBackups) { setBackups(await onListBackups()); }
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
}
