/**
 * @file constants.ts
 * Application-wide constants: statuses, priorities, sort fields, fonts, date formats, CSV export fields.
 * Icon-dependent constants (STATUS_ICONS) require lucide-react.
 */
import { Inbox, Zap, Check, X } from "lucide-react";
import type { TaskStatus, TaskPriority } from "../types";

export const STATUSES: TaskStatus[] = ["inbox", "active", "done", "cancelled"];
export const STATUS_ICONS: Record<TaskStatus, typeof Inbox> = { inbox: Inbox, active: Zap, done: Check, cancelled: X };
export const PRIORITY_COLORS: Record<TaskPriority, string> = { 1: "#ef4444", 2: "#fb923c", 3: "#60a5fa", 4: "#6b7280" };
export const STATUS_ORDER: Record<TaskStatus, number> = { inbox: 0, active: 1, done: 2, cancelled: 3 };
export const SORT_FIELDS = ["priority", "status", "due", "createdAt"] as const;

export const FONTS = [
  { label: "System default",  value: "" },
  { label: "Inter",           value: "Inter, sans-serif" },
  { label: "Roboto",          value: "Roboto, sans-serif" },
  { label: "Open Sans",       value: "'Open Sans', sans-serif" },
  { label: "Lato",            value: "Lato, sans-serif" },
  { label: "Montserrat",      value: "Montserrat, sans-serif" },
  { label: "Courier New",        value: "'Courier New', monospace" },
  { label: "JetBrains Mono NL", value: "'JetBrains Mono NL', monospace" },
  { label: "Georgia",            value: "Georgia, serif" },
];

export const DATE_FORMATS = ["iso", "dmy", "short", "us", "long"];

export const CSV_FIELDS = [
  { key: "title",      labelEn: "Title",      labelRu: "Название" },
  { key: "status",     labelEn: "Status",     labelRu: "Статус" },
  { key: "priority",   labelEn: "Priority",   labelRu: "Приоритет" },
  { key: "list",       labelEn: "List",       labelRu: "Список" },
  { key: "tags",       labelEn: "Tags",       labelRu: "Теги" },
  { key: "personas",   labelEn: "Personas",   labelRu: "Персонажи" },
  { key: "due",        labelEn: "Due date",   labelRu: "Дедлайн" },
  { key: "recurrence", labelEn: "Recurrence", labelRu: "Повторение" },
  { key: "flowId",     labelEn: "Task Flow",  labelRu: "Task Flow" },
  { key: "dependsOn",  labelEn: "Depends on", labelRu: "Зависит от" },
  { key: "url",        labelEn: "URL",        labelRu: "URL" },
  { key: "estimate",   labelEn: "Estimate",   labelRu: "Оценка" },
  { key: "createdAt",  labelEn: "Created",    labelRu: "Создана" },
];

export const VALID_STATUSES: TaskStatus[] = ['inbox', 'active', 'done', 'cancelled'];
export const VALID_PRIORITIES: TaskPriority[] = [1, 2, 3, 4];

// ─── Timing defaults ──────────────────────────────────────────────────────
export const TOAST_DURATION_MS = 3000;
export const SYNC_COOLDOWN_MS = 5000;
export const AUTO_SYNC_DELAY_MS = 3000;

// ─── Day Planner defaults ─────────────────────────────────────────────────
export const PLANNER_DAY_START_DEFAULT = 9;
export const PLANNER_DAY_END_DEFAULT = 17;
export const PLANNER_SLOT_STEP_DEFAULT = 30;
export const DEFAULT_TASK_ESTIMATE_MIN = 60;

// ─── Z-index layers (ordered low → high) ──────────────────────────────────
export const Z = {
  DIALOG: 50,          // modal dialogs (Settings, TaskEdit, RtmImport)
  DATE_PICKER: 200,    // date picker dropdown
  CONTEXT_MENU: 999,   // right-click context menu
  PLANNER_EDITOR: 9998, // planner inline editor overlay
  OVERLAY: 9999,       // drag selection, planner context menu
  GUIDE: 10000,        // onboarding guide
  DRAG_GHOST: 99999,   // drag ghost element (always on top)
} as const;
