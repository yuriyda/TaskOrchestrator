/**
 * @file StatusBar.tsx
 * @description Bottom status bar showing task counters, daily progress, and last action info.
 */

import { useState, useEffect } from "react";
import { HardDrive, RefreshCw, Clock } from "lucide-react";
import { useApp } from "./AppContext";
import { fmtDate, localIsoDate } from "../core/date";
import type { Task } from "../types";

interface Slot {
  slotType: string;
  startTime: string;
  endTime: string;
}

interface StatusBarProps {
  tasks: Task[];
  lastAction: string;
  canUndo: boolean;
  clockFormat: string;
  dateFormat: string;
  dbPath?: string;
  lastSync?: string;
  onSyncNow?: () => Promise<void>;
  autoSyncing: boolean;
  onOpenSyncSettings?: () => void;
  plannerSlots?: Slot[];
  plannerDayStart?: number;
  plannerDayEnd?: number;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function StatusBar({ tasks, lastAction, canUndo, clockFormat, dateFormat, dbPath, lastSync, onSyncNow, autoSyncing, onOpenSyncSettings, plannerSlots = [], plannerDayStart, plannerDayEnd }: StatusBarProps) {
  const { t, TC, locale } = useApp();
  const [now, setNow] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<"ok" | null>(null); // "ok" | null
  const [syncError, setSyncError] = useState<string | null>(null);
  const isSyncing = syncing || autoSyncing;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayISO = localIsoDate(now);
  const dateStr = fmtDate(todayISO, dateFormat, locale);

  const totalCount = tasks.length;
  const activeToday = tasks.filter(tk => tk.status === "active" && (!tk.due || tk.due <= todayISO)).length;
  const doneToday = tasks.filter(tk => tk.status === "done" && tk.completedAt && tk.completedAt.slice(0, 10) === todayISO).length;
  const overdueCount = tasks.filter(tk => tk.due && tk.due < todayISO && tk.status !== "done" && tk.status !== "cancelled").length;

  const progressTotal = activeToday + doneToday;
  const progressPct = progressTotal > 0 ? Math.round(doneToday / progressTotal * 100) : 0;

  // Planner summary (only when planner is visible and has slots)
  const plannerSummary = plannerSlots.length > 0 ? (() => {
    const taskSlots = plannerSlots.filter(s => s.slotType === "task");
    const blockedSlots = plannerSlots.filter(s => s.slotType === "blocked");
    const plannedMin = taskSlots.reduce((sum, s) => sum + timeToMinutes(s.endTime) - timeToMinutes(s.startTime), 0);
    const blockedMin = blockedSlots.reduce((sum, s) => sum + timeToMinutes(s.endTime) - timeToMinutes(s.startTime), 0);
    const dayStart = (plannerDayStart ?? 8) * 60;
    const dayEnd = (plannerDayEnd ?? 20) * 60;
    const totalAvail = (dayEnd - dayStart) - blockedMin;
    return { planned: (plannedMin / 60).toFixed(1), total: (totalAvail / 60).toFixed(1) };
  })() : null;

  return (
    <div className={`flex items-center gap-2 px-4 py-1 text-[10px] flex-shrink-0 border-t select-none overflow-hidden whitespace-nowrap min-h-0 ${TC.borderClass} ${TC.textMuted}`}>
      {/* Left section — shrinks when space is tight */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {/* DB path */}
        <span title={dbPath || "tasks.db"} className="flex items-center gap-1 opacity-50 flex-shrink-0">
          <HardDrive size={10} className="flex-shrink-0" />
          <span className="truncate max-w-[80px]">{(dbPath || "tasks.db").replace(/^.*[/\\]/, "")}</span>
        </span>

        {/* Date */}
        <span className="opacity-60 flex-shrink-0">{dateStr}</span>

        <span className="opacity-30 flex-shrink-0">|</span>

        {/* Task counters */}
        <span className="truncate">{totalCount} {t("sb.total")}</span>
        <span className="truncate">{activeToday} {t("sb.active")}</span>
        <span className="text-green-400 truncate">{doneToday} {t("sb.doneToday")}</span>
        {overdueCount > 0 && <span className="text-red-400 truncate">{overdueCount} {t("sb.overdue")}</span>}

        {/* Progress bar */}
        {progressTotal > 0 && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="inline-block w-[60px] h-[4px] rounded-full bg-slate-700 overflow-hidden">
              <span className="block h-full rounded-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }} />
            </span>
            <span className="text-green-400">{progressPct}%</span>
          </span>
        )}

        {/* Last sync */}
        {lastSync && (
          <>
            <span className="opacity-30 flex-shrink-0">|</span>
            <span className="opacity-50 truncate" title={`${t("sync.lastSync")}: ${new Date(lastSync).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}>
              {t("sync.lastSync")}: {new Date(lastSync).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
      </div>

      {/* Spacer */}
      <span className="flex-1 min-w-0" />

      {/* Planner summary */}
      {plannerSummary && (
        <span className="flex items-center gap-1 flex-shrink-0 text-amber-400/70">
          <Clock size={10} />
          <span>{plannerSummary.planned} / {plannerSummary.total} h {t("planner.planned")}</span>
        </span>
      )}

      {/* Last action + undo hint */}
      {lastAction && (
        <span className="truncate max-w-[250px] opacity-70 flex-shrink min-w-0" title={lastAction}>{lastAction}</span>
      )}
      {lastAction && canUndo && (
        <span className="opacity-40 mx-0.5 flex-shrink-0">·</span>
      )}
      {canUndo && (
        <span className="opacity-50 text-sky-400 flex-shrink-0">Ctrl+Z — Undo</span>
      )}

      {/* Sync now button — крайний правый */}
      {onSyncNow ? (
        <button
          title={[
            lastSync ? `${t("sync.lastSync")}: ${new Date(lastSync).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : null,
            syncError ? `${t("sync.gdriveError")}: ${syncError}` : null,
          ].filter(Boolean).join("\n") || t("sync.syncNow")}
          disabled={isSyncing}
          onClick={async () => {
            setSyncing(true);
            setSyncResult(null);
            try {
              await onSyncNow();
              setSyncResult("ok");
              setSyncError(null);
              setTimeout(() => setSyncResult(null), 3000);
            } catch (err: any) {
              setSyncError(err?.message || String(err));
            } finally {
              setSyncing(false);
            }
          }}
          className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer
            ${isSyncing ? "opacity-40 cursor-not-allowed" : "hover:opacity-100 opacity-60"}
            ${syncResult === "ok" ? "text-green-400" : syncError ? "text-red-400" : ""}`}
        >
          <RefreshCw size={10} className={isSyncing ? "animate-spin" : ""} />
          <span>{t("sync.syncNow")}</span>
        </button>
      ) : onOpenSyncSettings && (
        <button
          title={locale === "ru" ? "Настроить синхронизацию" : "Set up sync"}
          onClick={onOpenSyncSettings}
          className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:opacity-100 opacity-40"
        >
          <RefreshCw size={10} />
          <span>{t("sync.syncNow")}</span>
        </button>
      )}
    </div>
  );
}
