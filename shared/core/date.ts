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

export function parseDateInput(str: string | null | undefined): string | null {
  const s = (str || "").trim().toLowerCase();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  // Natural language: today / сегодня
  if (s === "today" || s === "сегодня") return localIsoDate(new Date());
  // tomorrow / завтра
  if (s === "tomorrow" || s === "завтра") { const d = new Date(); d.setDate(d.getDate() + 1); return localIsoDate(d); }
  // yesterday / вчера
  if (s === "yesterday" || s === "вчера") { const d = new Date(); d.setDate(d.getDate() - 1); return localIsoDate(d); }
  // Relative: +3d (days), +2w (weeks), +1m (months)
  let m = s.match(/^\+(\d+)([dwm])$/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    if (m[2] === "d") d.setDate(d.getDate() + n);
    else if (m[2] === "w") d.setDate(d.getDate() + n * 7);
    else if (m[2] === "m") d.setMonth(d.getMonth() + n);
    return localIsoDate(d);
  }
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
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
