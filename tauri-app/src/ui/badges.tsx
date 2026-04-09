/**
 * @file badges.tsx
 * Inline badge components for task priority and status.
 * PriorityBadge — colored pill with flag icon indicating task priority level.
 * StatusBadge — clickable status indicator with icon and translated label.
 */
import { type MouseEvent } from "react";
import { Flag } from "lucide-react";
import { PRIORITY_COLORS, STATUS_ICONS } from "../core/constants";
import { useApp } from "./AppContext";
import type { TaskPriority, TaskStatus } from "../types";

interface PriorityBadgeProps {
  priority: TaskPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", background: (PRIORITY_COLORS as Record<number, string>)[priority], flexShrink: 0 }}>
      <Flag size={10} /> {priority}
    </span>
  );
}

interface StatusBadgeProps {
  status: TaskStatus;
  onClick: (e: MouseEvent) => void;
}

export function StatusBadge({ status, onClick }: StatusBadgeProps) {
  const { t } = useApp();
  const safeStatus = (STATUS_ICONS as Record<string, any>)[status] ? status : "inbox";
  const Icon = (STATUS_ICONS as Record<string, any>)[safeStatus];
  const cls = {
    inbox:     "bg-gray-600/50 text-gray-200 border border-gray-500/40",
    active:    "bg-sky-600/20 text-sky-300 border border-sky-500/40",
    done:      "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40",
    cancelled: "bg-red-600/20 text-red-300 border border-red-500/40",
  }[safeStatus];
  return (
    <button onClick={onClick} title={t("statusbadge.title")}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 flex-shrink-0 ${cls}`}>
      <Icon size={12} /> {t("status." + safeStatus)}
    </button>
  );
}
