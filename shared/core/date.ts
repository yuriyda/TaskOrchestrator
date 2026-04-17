// ─── Date utilities ─────────────────────────────────────────────────────────
// Extracted from task-orchestrator.jsx and useTauriTaskStore.js

import type { ISODate } from '../types'

export const ISO_DATE_RE: RegExp = /^\d{4}-\d{2}-\d{2}$/

export function safeIsoDate(v: string | null | undefined): ISODate | null {
  if (!v) return null
  if (ISO_DATE_RE.test(v)) return v
  console.warn('[TaskStore] Rejected non-ISO date value:', v)
  return null
}

// Convert a timestamp (ms) to a local YYYY-MM-DD string.
// Using toISOString() would give UTC date and shift the day back for UTC+ timezones.
export function localDateStr(ts: number): ISODate {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localIsoDate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Smart date parsing ─────────────────────────────────────────────────────
// Supports: ISO, natural language, day-of-week, relative offsets, bare day
// numbers, DD.MM / DD/MM, month name combos. Always returns next future date.

const DAY_NAMES: Record<string, number> = {
  // EN short
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  // EN full
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  // RU short
  вс: 0, пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6,
  // RU full
  воскресенье: 0, понедельник: 1, вторник: 2, среда: 3, четверг: 4, пятница: 5, суббота: 6,
};

const MONTH_NAMES: Record<string, number> = {
  // EN short
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  // EN full
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  // RU short
  янв: 0, фев: 1, мар: 2, апр: 3, мая: 4, май: 4, июн: 5, июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  // RU full
  января: 0, февраля: 1, марта: 2, апреля: 3, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

/** Return the next future date for a given day-of-week (0=Sun). */
function nextDayOfWeek(dow: number): Date {
  const d = new Date();
  let diff = dow - d.getDay();
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Return the next future date for a given day-of-month. */
function nextDayOfMonth(day: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return d;
}

/** Return the next future date for a given day + month (0-indexed). */
function nextDayMonth(day: number, month: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), month, day);
  if (d <= now) d.setFullYear(d.getFullYear() + 1);
  return d;
}

export function parseDateInput(str: string | null | undefined): string | null {
  const s = (str || "").trim().toLowerCase();
  if (!s) return "";
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ── Natural language keywords ─────────────────────────────────────────
  if (s === "today" || s === "сегодня") return localIsoDate(new Date());
  if (s === "tomorrow" || s === "завтра") { const d = new Date(); d.setDate(d.getDate() + 1); return localIsoDate(d); }
  if (s === "yesterday" || s === "вчера") { const d = new Date(); d.setDate(d.getDate() - 1); return localIsoDate(d); }

  // ── Day-of-week names (short, full, EN + RU) ─────────────────────────
  if (s in DAY_NAMES) return localIsoDate(nextDayOfWeek(DAY_NAMES[s]));

  // ── Relative: +3d, +2w, +1m ──────────────────────────────────────────
  let m = s.match(/^\+(\d+)([dwm])$/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    if (m[2] === "d") d.setDate(d.getDate() + n);
    else if (m[2] === "w") d.setDate(d.getDate() + n * 7);
    else if (m[2] === "m") d.setMonth(d.getMonth() + n);
    return localIsoDate(d);
  }

  // ── Bare day number: "20" → 20th of current/next month ───────────────
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1]);
    if (day >= 1 && day <= 31) return localIsoDate(nextDayOfMonth(day));
  }

  // ── DD.MM or DD/MM (no year) → next future occurrence ────────────────
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})$/);
  if (m) {
    const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return localIsoDate(nextDayMonth(day, month));
    }
  }

  // ── DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY ──────────────────────────
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // ── Month name + day: "5jan", "jan5", "5янв", "янв5" ─────────────────
  m = s.match(/^(\d{1,2})([a-zа-яё]+)$/);
  if (m && m[2] in MONTH_NAMES) {
    const day = parseInt(m[1]);
    if (day >= 1 && day <= 31) return localIsoDate(nextDayMonth(day, MONTH_NAMES[m[2]]));
  }
  m = s.match(/^([a-zа-яё]+)(\d{1,2})$/);
  if (m && m[1] in MONTH_NAMES) {
    const day = parseInt(m[2]);
    if (day >= 1 && day <= 31) return localIsoDate(nextDayMonth(day, MONTH_NAMES[m[1]]));
  }

  return null; // unparseable
}

export function fmtDate(iso: string | null, format: string, locale: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  if (format === "dmy")   return `${d}-${m}-${y}`;
  if (format === "us")    return `${m}/${d}/${y}`;
  if (format === "short") return locale === "ru" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
  if (format === "long") {
    try {
      return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric", month: "long", year: "numeric",
      }).format(new Date(`${iso}T12:00:00`));
    } catch { return iso; }
  }
  return iso; // "iso" (default)
}
