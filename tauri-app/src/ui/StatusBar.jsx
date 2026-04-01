/**
 * @file StatusBar.jsx
 * @description Bottom status bar showing task counters, daily progress, and last action info.
 */

import { useState, useEffect, useRef } from "react";
import { HardDrive } from "lucide-react";
import { useApp } from "./AppContext";
import { fmtDate } from "../core/date";

export function StatusBar({ tasks, lastAction, canUndo, clockFormat, dateFormat, dbPath, lastSync }) {
  const { t, TC, locale } = useApp();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayISO = now.toISOString().slice(0, 10);
  const dateStr = fmtDate(todayISO, dateFormat, locale);

  const totalCount = tasks.length;
  const activeToday = tasks.filter(tk => tk.status === "active" && (!tk.due || tk.due <= todayISO)).length;
  const doneToday = tasks.filter(tk => tk.status === "done" && tk.completedAt && tk.completedAt.slice(0, 10) === todayISO).length;
  const overdueCount = tasks.filter(tk => tk.due && tk.due < todayISO && tk.status !== "done" && tk.status !== "cancelled").length;

  const progressTotal = activeToday + doneToday;
  const progressPct = progressTotal > 0 ? Math.round(doneToday / progressTotal * 100) : 0;

  return (
    <div className={`flex items-center gap-2 px-4 py-1 text-[10px] flex-shrink-0 border-t select-none overflow-hidden whitespace-nowrap min-h-0 ${TC.borderClass} ${TC.textMuted}`}>
      {/* DB path */}
      <span title={dbPath || "tasks.db"} className="flex items-center gap-1 opacity-50">
        <HardDrive size={10} className="flex-shrink-0" />
        <span className="truncate max-w-[80px]">{(dbPath || "tasks.db").replace(/^.*[/\\]/, "")}</span>
      </span>

      {/* Date */}
      <span className="opacity-60">{dateStr}</span>

      <span className="opacity-30">|</span>

      {/* Task counters */}
      <span>{totalCount} {t("sb.total")}</span>
      <span>{activeToday} {t("sb.active")}</span>
      <span className="text-green-400">{doneToday} {t("sb.doneToday")}</span>
      {overdueCount > 0 && <span className="text-red-400">{overdueCount} {t("sb.overdue")}</span>}

      {/* Progress bar */}
      {progressTotal > 0 && (
        <span className="flex items-center gap-1">
          <span className="inline-block w-[60px] h-[4px] rounded-full bg-slate-700 overflow-hidden">
            <span className="block h-full rounded-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }} />
          </span>
          <span className="text-green-400">{progressPct}%</span>
        </span>
      )}

      {/* Last sync */}
      {lastSync && (
        <>
          <span className="opacity-30">|</span>
          <span className="opacity-50" title={lastSync}>
            {t("sync.lastSync") || "Last sync"}: {new Date(lastSync).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Last action + undo hint */}
      {lastAction && (
        <span className="truncate max-w-[250px] opacity-70" title={lastAction}>{lastAction}</span>
      )}
      {lastAction && canUndo && (
        <span className="opacity-40 mx-0.5">·</span>
      )}
      {canUndo && (
        <span className="opacity-50 text-sky-400">Ctrl+Z — Undo</span>
      )}
    </div>
  );
}
