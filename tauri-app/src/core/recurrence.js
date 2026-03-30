// ─── Recurrence utilities ───────────────────────────────────────────────────
// Extracted from task-orchestrator.jsx and useTauriTaskStore.js

export function ruPlural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function humanRecurrence(value, locale) {
  if (!value) return null;
  const isRu = locale === "ru";

  // Simple keyword shortcuts (used in quick entry and seed data)
  const SIMPLE = {
    daily:    { en: "Every day",    ru: "Каждый день"    },
    weekly:   { en: "Every week",   ru: "Каждую неделю"  },
    monthly:  { en: "Every month",  ru: "Каждый месяц"   },
    yearly:   { en: "Every year",   ru: "Каждый год"     },
    annual:   { en: "Every year",   ru: "Каждый год"     },
    biweekly: { en: "Every 2 weeks",ru: "Каждые 2 недели"},
  };
  const simple = SIMPLE[value.toLowerCase().trim()];
  if (simple) return isRu ? simple.ru : simple.en;

  // Parse RRULE (with or without the "RRULE:" prefix)
  const ruleStr = value.startsWith("RRULE:") ? value.slice(6) : value;
  const p = {};
  for (const seg of ruleStr.split(";")) {
    const eq = seg.indexOf("=");
    if (eq > 0) p[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }

  const freq = p["FREQ"]?.toUpperCase();
  if (!freq) return value; // unknown format — show as-is

  const interval = parseInt(p["INTERVAL"] || "1");
  const byDay    = p["BYDAY"];
  const byMonth  = p["BYMONTH"];

  const DAY = {
    en: { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" },
    ru: { MO: "Пн",  TU: "Вт",  WE: "Ср",  TH: "Чт",  FR: "Пт",  SA: "Сб",  SU: "Вс"  },
  };
  const MONTH = {
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    ru: ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"],
  };
  const dayNames = isRu ? DAY.ru : DAY.en;

  // Parses BYDAY day list like "MO,WE,FR" or "1MO,-1FR"
  const parseDays = (raw) =>
    raw.split(",").map(d => {
      const m = d.match(/([A-Z]{2})$/);
      return m ? (dayNames[m[1]] ?? m[1]) : d;
    }).join(", ");

  // Ordinal strings for BYDAY with numeric prefix (monthly recurrence)
  const ORD_EN = { "1":"1st","2":"2nd","3":"3rd","4":"4th","-1":"Last" };
  const ORD_RU = { "1":"Первый","2":"Второй","3":"Третий","4":"Четвёртый","-1":"Последний" };
  const ordStr = (n) => (isRu ? ORD_RU[n] : ORD_EN[n]) ?? (isRu ? n : `${n}th`);

  switch (freq) {
    case "DAILY": {
      if (interval === 1) return isRu ? "Каждый день" : "Every day";
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "день", "дня", "дней")}`
        : `Every ${interval} days`;
    }
    case "WEEKLY": {
      const days = byDay ? `: ${parseDays(byDay)}` : "";
      if (interval === 1) return isRu ? `Каждую неделю${days}` : `Every week${days}`;
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "неделю", "недели", "недель")}${days}`
        : `Every ${interval} weeks${days}`;
    }
    case "MONTHLY": {
      if (byDay) {
        const m = byDay.match(/^(-?\d)([A-Z]{2})$/);
        if (m) {
          const day = dayNames[m[2]] ?? m[2];
          return isRu
            ? `${ordStr(m[1])} ${day} каждого месяца`
            : `${ordStr(m[1])} ${day} each month`;
        }
      }
      if (interval === 1) return isRu ? "Каждый месяц" : "Every month";
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "месяц", "месяца", "месяцев")}`
        : `Every ${interval} months`;
    }
    case "YEARLY": {
      const extra = (byMonth && !isNaN(parseInt(byMonth)))
        ? ` (${(isRu ? MONTH.ru : MONTH.en)[parseInt(byMonth) - 1] ?? byMonth})`
        : "";
      if (interval === 1) return isRu ? `Каждый год${extra}` : `Every year${extra}`;
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "год", "года", "лет")}${extra}`
        : `Every ${interval} years${extra}`;
    }
    default:
      return value;
  }
}

// Returns next due date string for a recurring task, or null for unknown recurrence.
// Handles both simple strings ("daily","weekly","monthly") and iCal RRULE
// ("FREQ=DAILY;INTERVAL=1;WKST=SU" etc.) as stored from RTM import.
export function nextDue(due, recurrence) {
  if (!recurrence) return null
  const today = new Date().toISOString().slice(0, 10)
  const base  = (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) ? due : today
  const d = new Date(base + 'T12:00:00')

  let freq     = recurrence.toLowerCase()  // default: treat whole string as freq
  let interval = 1

  if (recurrence.includes('FREQ=')) {
    const fm = recurrence.match(/FREQ=([A-Z]+)/i)
    const im = recurrence.match(/INTERVAL=(\d+)/i)
    freq     = fm ? fm[1].toLowerCase() : null
    interval = im ? parseInt(im[1], 10) : 1
  }

  if      (freq === 'daily')   d.setDate(d.getDate() + interval)
  else if (freq === 'weekly')  d.setDate(d.getDate() + 7 * interval)
  else if (freq === 'monthly') d.setMonth(d.getMonth() + interval)
  else if (freq === 'yearly')  d.setFullYear(d.getFullYear() + interval)
  else return null

  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}
