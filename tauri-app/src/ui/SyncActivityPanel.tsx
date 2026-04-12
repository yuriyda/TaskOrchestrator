/**
 * @file SyncActivityPanel.tsx
 * Diagnostic panel showing local DB changes from incoming sync operations.
 * Displays task inserts, updates, deletes with field diffs and duplicate warnings.
 *
 * Rules:
 * - Auto-shows when syncing starts, auto-hides 3s after completion.
 * - Manual toggle via icon in StatusBar.
 * - Resizable via draggable horizontal divider.
 */
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Plus, Trash2, Edit3, X } from "lucide-react";
import { useApp } from "./AppContext";
import type { SyncActivityEntry } from "../store/syncActivityLog";
interface SyncActivityPanelProps {
  entries: SyncActivityEntry[];
  visible: boolean;
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

const ACTION_ICON = {
  insert: Plus,
  update: Edit3,
  delete: Trash2,
} as const;

const ACTION_LABEL_EN = { insert: "Created", update: "Updated", delete: "Deleted" };
const ACTION_LABEL_RU = { insert: "Создана", update: "Обновлена", delete: "Удалена" };

export function SyncActivityPanel({ entries, visible, height, onResizeStart }: SyncActivityPanelProps) {
  const { t, locale, TC } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const labels = locale === "ru" ? ACTION_LABEL_RU : ACTION_LABEL_EN;
  const [jsonModal, setJsonModal] = useState<{ entry: SyncActivityEntry } | null>(null);

  // Auto-scroll to top on new entries
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [entries.length]);

  if (!visible) return null;

  return (
    <div className="flex flex-col flex-shrink-0" style={{ height }}>
      {/* Resizable divider */}
      <div
        className={`h-1.5 flex-shrink-0 cursor-row-resize hover:bg-white/10 active:bg-white/15 transition-colors border-t ${TC.borderClass} flex items-center justify-center`}
        onMouseDown={onResizeStart}
      >
        <div className="w-8 h-0.5 rounded bg-white/20" />
      </div>

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 ${TC.textMuted}`}>
        <span>{locale === "ru" ? "Журнал синхронизации" : "Sync Activity Log"}</span>
        <span className="opacity-50">({entries.length})</span>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {entries.length === 0 ? (
          <div className={`text-xs text-center py-4 ${TC.textMuted}`}>
            {locale === "ru" ? "Нет записей" : "No entries"}
          </div>
        ) : (
          entries.map(entry => {
            const Icon = ACTION_ICON[entry.action] || Edit3;
            const actionColor = entry.action === 'insert' ? 'text-green-400'
              : entry.action === 'delete' ? 'text-red-400'
              : 'text-sky-400';

            return (
              <div
                key={entry.id}
                className={`flex items-start gap-2 px-2 py-1 text-[11px] rounded mb-0.5 cursor-pointer ${entry.isDuplicate ? 'bg-amber-500/10 border border-amber-500/30' : `hover:${TC.hoverBg}`}`}
                onDoubleClick={() => setJsonModal({ entry, task: null })}
              >
                {/* Action icon */}
                <Icon size={12} className={`flex-shrink-0 mt-0.5 ${actionColor}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-medium truncate ${TC.text}`}>{entry.taskTitle}</span>
                    {entry.isDuplicate && (
                      <span className="flex items-center gap-0.5 text-amber-400 flex-shrink-0">
                        <AlertTriangle size={10} />
                        <span className="text-[9px] font-bold uppercase">
                          {locale === "ru" ? "дубль" : "duplicate"}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-1.5 ${TC.textMuted}`}>
                    <span>{labels[entry.action]}</span>
                    {entry.changedFields && (
                      <span className="opacity-70">· {entry.changedFields}</span>
                    )}
                    {entry.deviceId && (
                      <span className="opacity-50" title={entry.deviceId}>
                        · {locale === "ru" ? "Девайс" : "Device"}: {entry.deviceId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <span className={`flex-shrink-0 tabular-nums ${TC.textMuted}`}>
                  {new Date(entry.timestamp).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* JSON detail modal */}
      {jsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setJsonModal(null)}
             onKeyDown={e => { if (e.key === 'Escape') setJsonModal(null); }}
             tabIndex={-1}
             ref={el => el?.focus()}>
          <div className={`relative rounded-lg shadow-2xl border p-4 max-w-lg w-full max-h-[70vh] flex flex-col ${TC.surface} ${TC.borderClass}`}
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm font-semibold ${TC.text}`}>
                {jsonModal.entry.taskTitle} — {labels[jsonModal.entry.action]}
              </span>
              <button onClick={() => setJsonModal(null)} className={`p-1 rounded hover:bg-white/10 ${TC.textMuted}`}>
                <X size={14} />
              </button>
            </div>
            <div className={`text-[10px] mb-2 ${TC.textMuted}`}>
              {locale === "ru" ? "Входящая дельта синхронизации" : "Incoming sync delta"}
            </div>
            <pre className={`flex-1 overflow-auto text-[11px] p-3 rounded border ${TC.borderClass} ${TC.textSec}`} style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(jsonModal.entry.incomingData || { id: jsonModal.entry.taskId, _noData: true }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
