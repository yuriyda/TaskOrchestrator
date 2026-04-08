/**
 * @file DatePicker.jsx
 * @description Calendar date picker with month/year navigation, inline anchor variant,
 *   and a DateField button that toggles the picker.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useApp } from "./AppContext";
import { localIsoDate, parseDateInput, fmtDate } from "../core/date";
import type { RefObject } from "react";

interface DatePickerProps {
  value: string | null;
  onChange: (date: string | null) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function DatePicker({ value, onChange, onClose, anchorRef }: DatePickerProps) {
  const { t, TC, settings } = useApp();
  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00") : new Date();
  const [viewDate, setViewDate] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayStr = localIsoDate(new Date());
  const formatDay = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const fdow = settings?.firstDayOfWeek ?? 1;
  const firstDow = (new Date(year, month, 1).getDay() - fdow + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  // Position fixed relative to anchor
  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const popH = 260, popW = 220;
    let top = r.bottom + 4;
    let left = r.left;
    if (top + popH > window.innerHeight) top = r.top - popH - 4;
    if (left + popW > window.innerWidth) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [anchorRef]);

  return (
    <div ref={ref} className={`fixed z-[200] rounded-lg border shadow-xl p-2 ${TC.surface} ${TC.borderClass}`} style={{ width: 220, top: pos.top, left: pos.left }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-0.5">
          <button onClick={() => setViewDate(new Date(year - 1, month, 1))} className={`p-0.5 rounded text-[10px] ${TC.textMuted} hover:text-gray-200`}>«</button>
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className={`p-0.5 rounded ${TC.textMuted} hover:text-gray-200`}><ChevronLeft size={12} /></button>
        </div>
        <button onClick={() => setViewDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          className={`text-xs font-medium transition-colors hover:text-sky-400 ${TC.textSec}`}>
          {t("cal.month." + month)} {year}
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className={`p-0.5 rounded ${TC.textMuted} hover:text-gray-200`}><ChevronRight size={12} /></button>
          <button onClick={() => setViewDate(new Date(year + 1, month, 1))} className={`p-0.5 rounded text-[10px] ${TC.textMuted} hover:text-gray-200`}>»</button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`text-center text-[10px] font-medium ${TC.textMuted}`}>
            {t("cal.day." + ((i + fdow) % 7 + 6) % 7)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = formatDay(d);
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === value;
          return (
            <button key={d} onClick={() => { onChange(dateStr); onClose(); }}
              className={`flex items-center justify-center h-6 rounded text-xs transition-colors
                ${isSelected ? "bg-sky-600 text-white"
                : isToday    ? `${TC.elevated} text-sky-400`
                :              `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              {d}
            </button>
          );
        })}
      </div>
      {value && (
        <button onClick={() => { onChange(null); onClose(); }}
          className={`mt-1.5 w-full text-[10px] text-center transition-colors ${TC.textMuted} hover:text-red-400`}>
          ✕ {t("cal.clearFilter")}
        </button>
      )}
    </div>
  );
}

interface DatePickerAnchorProps {
  value: string | null;
  onChange: (date: string | null) => void;
  onClose: () => void;
}

export function DatePickerAnchor({ value, onChange, onClose }: DatePickerAnchorProps) {
  const anchorRef = useRef(null);
  return (
    <span ref={anchorRef} className="inline-block">
      <DatePicker anchorRef={anchorRef} value={value} onChange={onChange} onClose={onClose} />
    </span>
  );
}

interface DateFieldProps {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

export function DateField({ value, onChange, className }: DateFieldProps) {
  const { settings, locale, TC } = useApp();
  const fmt = settings?.dateFormat || "iso";
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${className} text-left flex items-center justify-between cursor-pointer`}
      >
        <span className={value ? "" : `${TC.textMuted}`}>{value ? fmtDate(value, fmt, locale) : "—"}</span>
        <Calendar size={13} className={`${TC.textMuted} opacity-60`} />
      </button>
      {open && (
        <DatePicker
          anchorRef={anchorRef}
          value={value || null}
          onChange={(iso) => { onChange(iso || ""); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
