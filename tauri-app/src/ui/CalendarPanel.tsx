/**
 * @module CalendarPanel
 * @description Compact monthly calendar widget used in the sidebar. Highlights
 * days that have tasks, the current date, and any active date-range filter.
 * Clicking a day sets (or clears) a per-day calendar filter that narrows the
 * main task list. Supports configurable first-day-of-week (Monday/Sunday).
 *
 * @param {Object}   props
 * @param {Array}    props.tasks            - Full task list (scanned for due dates).
 * @param {string|null} props.calendarFilter - Currently selected date string (YYYY-MM-DD) or null.
 * @param {Function} props.setCalendarFilter - Setter to update the calendar filter.
 * @param {string|null} props.dateRange      - Active sidebar date-range preset ("today"|"tomorrow"|"week"|"month"|null).
 */

import { useState, useMemo } from "react";
import { useApp } from "./AppContext";
import { localIsoDate } from "../core/date";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CalendarPanel({ tasks, calendarFilter, setCalendarFilter, dateRange }) {
  const { t, TC, settings } = useApp();
  const today = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const taskDays = useMemo(() => {
    const s = new Set();
    tasks.forEach(t => { if (t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due)) s.add(t.due); });
    return s;
  }, [tasks]);

  const todayStr = localIsoDate(today);
  const formatDay = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Compute highlighted date range from sidebar dateRange filter
  const rangeEnd = useMemo(() => {
    if (!dateRange) return null;
    const d = new Date();
    if (dateRange === "today") return todayStr;
    if (dateRange === "tomorrow") { d.setDate(d.getDate() + 1); return localIsoDate(d); }
    if (dateRange === "week") { d.setDate(d.getDate() + 7); return localIsoDate(d); }
    if (dateRange === "month") { d.setDate(d.getDate() + 30); return localIsoDate(d); }
    return null;
  }, [dateRange, todayStr]);
  const isInRange = (dateStr) => rangeEnd && dateStr >= todayStr && dateStr <= rangeEnd;

  // firstDayOfWeek: 1 = Monday (default), 0 = Sunday
  const fdow = settings?.firstDayOfWeek ?? 1;
  const firstDow = (new Date(year, month, 1).getDay() - fdow + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className={`flex-shrink-0 border-b p-3 select-none ${TC.borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className={`p-1 rounded transition-colors ${TC.textMuted} hover:text-gray-200`}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className={`text-xs font-medium transition-colors hover:text-sky-400 ${TC.textSec}`}>
          {t("cal.month." + month)} {year}
        </button>
        <button onClick={nextMonth} className={`p-1 rounded transition-colors ${TC.textMuted} hover:text-gray-200`}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`text-center text-xs font-medium ${TC.textMuted}`}>
            {t("cal.day." + ((i + fdow) % 7 + 6) % 7)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = formatDay(d);
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === calendarFilter;
          const hasTasks   = taskDays.has(dateStr);
          const inRange    = isInRange(dateStr);
          return (
            <button key={d} onClick={() => setCalendarFilter(isSelected ? null : dateStr)}
              className={`relative flex items-center justify-center h-7 w-full rounded text-xs font-medium transition-colors
                ${isSelected ? "bg-sky-600 text-white"
                : isToday    ? `${TC.elevated} text-sky-400`
                : inRange    ? "bg-sky-600/15 text-sky-300"
                :              `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              {d}
              {hasTasks && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? "bg-white/70" : "bg-violet-400"}`} />
              )}
            </button>
          );
        })}
      </div>
      {calendarFilter && (
        <button onClick={() => setCalendarFilter(null)}
          className={`mt-2 w-full text-xs text-center transition-colors ${TC.textMuted} hover:text-gray-300`}>
          {t("cal.clearFilter")} × {calendarFilter}
        </button>
      )}
    </div>
  );
}
