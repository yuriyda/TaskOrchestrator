/**
 * @file RtmImportDialog.jsx
 * @description Remember The Milk import UI. RtmImportDialog shows a summary
 *   of data to be imported with options; ImportProgressOverlay displays a
 *   progress bar during the actual import process.
 */

import { useState } from "react";
import { useApp } from "./AppContext";

interface RtmImportData {
  tasks?: any[];
  lists?: any[];
  tags?: any[];
  notes?: any[];
  locations?: any[];
  smart_lists?: any[];
}

interface RtmImportDialogProps {
  data: RtmImportData;
  onConfirm: (includeCompleted: boolean) => void;
  onCancel: () => void;
}

export function RtmImportDialog({ data, onConfirm, onCancel }: RtmImportDialogProps) {
  const { t, TC } = useApp();
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const activeCount    = (data.tasks || []).filter(rt => !rt.date_completed && !rt.date_trashed).length;
  const completedCount = (data.tasks || []).length - activeCount;
  const toImportCount  = includeCompleted ? (data.tasks || []).length : activeCount;

  const warnings = [
    `${(data.locations || []).length} ${t("rtm.skipLocations")}`,
    `${(data.smart_lists || []).length} ${t("rtm.skipSmartLists")}`,
    t("rtm.skipSubtasks"),
    t("rtm.skipSource"),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-96 rounded-xl p-6 shadow-2xl border ${TC.surface} ${TC.borderClass}`}>
        <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("rtm.dialogTitle")}</h2>

        {/* Summary */}
        <div className={`rounded-lg p-3 mb-4 text-sm space-y-1 ${TC.elevated}`}>
          <div className={TC.text}>{t("rtm.tasks")}: <span className="text-sky-400">{activeCount} {t("rtm.active")}</span> + <span className={TC.textMuted}>{completedCount} {t("rtm.completed")}</span></div>
          <div className={TC.text}>{t("rtm.lists")}: <span className="text-emerald-400">{(data.lists || []).length}</span></div>
          <div className={TC.text}>{t("rtm.tags")}: <span className="text-sky-400">{(data.tags || []).length}</span></div>
          <div className={TC.text}>{t("rtm.notes")}: <span className="text-violet-400">{(data.notes || []).length}</span></div>
        </div>

        {/* Option */}
        <label className={`flex items-center gap-2 mb-4 text-sm cursor-pointer ${TC.text}`}>
          <input type="checkbox" checked={includeCompleted} onChange={e => setIncludeCompleted(e.target.checked)} className="rounded" />
          {t("rtm.includeCompleted")}
        </label>

        {/* Warnings */}
        <div className={`rounded-lg p-3 mb-4 text-xs space-y-1 border ${TC.borderClass}`}>
          <p className={`font-medium mb-1 ${TC.textMuted}`}>{t("rtm.skippedTitle")}</p>
          {warnings.map((w, i) => <p key={i} className="text-yellow-400/80">⚠ {w}</p>)}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className={`px-4 py-2 rounded text-sm transition-colors ${TC.elevated} ${TC.text} hover:opacity-80`}>
            {t("confirm.cancel")}
          </button>
          <button onClick={() => onConfirm(includeCompleted)}
            className="px-4 py-2 rounded text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors">
            {t("rtm.doImport")} {toImportCount} {t("rtm.records")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ImportProgressOverlay ────────────────────────────────────────────────────

interface ImportProgressOverlayProps {
  current: number;
  total: number;
}

export function ImportProgressOverlay({ current, total }: ImportProgressOverlayProps) {
  const { t, TC } = useApp();
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={`w-80 rounded-xl p-6 shadow-2xl border ${TC.surface} ${TC.borderClass}`}>
        <div className={`text-sm font-semibold mb-4 text-center ${TC.text}`}>
          {t("rtm.importing")}
        </div>
        {/* Progress bar */}
        <div className={`w-full h-2 rounded-full mb-3 overflow-hidden ${TC.elevated}`}>
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Counter */}
        <div className={`text-xs text-center mb-3 ${TC.textMuted}`}>
          {current} {t("rtm.importProgressOf")} {total} {t("rtm.importTasks")}
        </div>
        {/* Hint */}
        <div className={`text-xs text-center opacity-50 ${TC.textMuted}`}>
          {t("rtm.importPleaseWait")}
        </div>
      </div>
    </div>
  );
}
