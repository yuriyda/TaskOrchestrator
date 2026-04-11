/**
 * @file MaintenanceTab.tsx
 * Maintenance tab for SettingsDialog: DB path, open/create/move DB, backups.
 * Extracted from SettingsDialog to reduce component size.
 */
import { useState, useEffect } from "react";
import { Copy, FolderOpen } from "lucide-react";
import { useApp } from "../AppContext";
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
  onClose: () => void;
}

export function MaintenanceTab({ dbPath, onRevealDb, onOpenDb, onCreateNewDb, onMoveDb, onCreateBackup, onListBackups, onRestoreBackup, onClose }: MaintenanceTabProps) {
  const { t, TC } = useApp();
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [pathCopied, setPathCopied] = useState(false);

  useEffect(() => {
    if (backups === null && onListBackups) {
      onListBackups().then(setBackups);
    }
  }, [backups, onListBackups]);

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
