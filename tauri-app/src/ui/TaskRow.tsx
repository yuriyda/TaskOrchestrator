/**
 * @file TaskRow.tsx
 * Single task row rendered inside the task list.
 * Displays checkbox, status/priority badges, title, tags, due date, recurrence icon,
 * flow badge, dependency indicators, and note count. Supports selection highlighting,
 * cursor outline, overdue stripe colouring, and blocked-task dimming.
 */
import { useState, useRef, useEffect, type MouseEvent } from "react";
import { Check, Lock, User, Calendar, Repeat, Zap, AlertTriangle, FileText, Clock } from "lucide-react";
import { useApp } from "./AppContext";
import { StatusBadge, PriorityBadge } from "./badges";
import { overdueLevel, OVERDUE_DATE_CLS, OVERDUE_STRIPE, OVERDUE_BG } from "../core/overdue";
import { PRIORITY_COLORS } from "../core/constants";
import { fmtDate } from "../core/date";
import { humanRecurrence } from "../core/recurrence";
import type { Task } from "../types";

interface TaskRowProps {
  task: Task;
  isCursor: boolean;
  isSelected: boolean;
  isBlocked?: boolean;
  isPlanned?: boolean;
  hideStatus?: boolean;
  isRenaming?: boolean;
  onRename?: (newTitle: string) => void;
  onRenameCancel?: () => void;
  onStatusCycle: () => void;
  onClick: (e: MouseEvent) => void;
  onCheckboxClick: () => void;
  onDoubleClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  compact?: boolean;
  dataGuide?: string;
}

export function TaskRow({ task, isCursor, isSelected, isBlocked = false, isPlanned = false, hideStatus = false, isRenaming = false, onRename, onRenameCancel, onStatusCycle, onClick, onCheckboxClick, onDoubleClick, onContextMenu, compact = false, dataGuide }: TaskRowProps) {
  const { t, TC, locale, settings } = useApp();
  const isDone = task.status === "done";
  const [hovered, setHovered] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);
  const level = overdueLevel(task);

  // Left stripe: blue when selected, overdue colour otherwise
  const stripeColor = isSelected ? "#0ea5e9" : level ? OVERDUE_STRIPE[level] : null;
  const stripe = stripeColor ? `inset 3px 0 0 ${stripeColor}` : "";

  let outline = "";
  if (isSelected && isCursor) outline = "0 0 0 1px rgba(14,165,233,.35)";
  else if (isCursor)          outline = "0 0 0 1px rgba(14,165,233,.25)";
  else if (hovered)           outline = TC.taskHoverShadow;

  const shadow = [stripe, outline].filter(Boolean).join(", ") || "none";
  const bg = isSelected ? "rgba(14,165,233,.08)" : hovered ? TC.taskHoverBg : "transparent";

  return (
    <div
      data-task-id={task.id}
      {...(dataGuide ? { "data-guide": dataGuide } : {})}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ boxShadow: shadow, background: bg, transition: "background .1s, box-shadow .1s" }}
      className={`flex items-center px-4 rounded-lg cursor-pointer select-none
        ${settings?.condense ? "gap-2 py-1" : "gap-3 py-2.5"}
        ${task.status === "done" || task.status === "cancelled" ? "opacity-50" : ""}
        ${isBlocked && task.status !== "done" && task.status !== "cancelled" ? "opacity-55" : ""}`}
    >
      <button
        onClick={e => { e.stopPropagation(); onCheckboxClick(); }}
        className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border transition-colors
          ${isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-500 hover:border-emerald-400 bg-transparent"}`}
      >
        {isDone && <Check size={11} strokeWidth={3} className="text-white" />}
      </button>
      {isPlanned && (
        <span className="text-[10px] text-sky-400/60 bg-sky-400/10 px-1 py-0.5 rounded flex-shrink-0" title={t("planner.planned")}>
          <Clock size={10} />
        </span>
      )}
      {isBlocked && task.status !== "done" && task.status !== "cancelled" && (
        <Lock size={12} className="text-yellow-500/70 flex-shrink-0" />
      )}
      {(task.personas || []).map(p => (
        <span key={p} className="text-xs text-indigo-400/90 bg-indigo-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
          <User size={9} />{p}
        </span>
      ))}
      {!hideStatus && <StatusBadge status={task.status} onClick={e => { e.stopPropagation(); onStatusCycle(); }} />}
      <PriorityBadge priority={task.priority} />
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameRef}
            defaultValue={task.title}
            className={`text-sm w-full bg-transparent border-b border-sky-400/50 outline-none py-0 px-0 ${TC.text}`}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== task.title) onRename?.(v); else onRenameCancel?.(); }
              if (e.key === "Escape") { e.preventDefault(); onRenameCancel?.(); }
              e.stopPropagation();
            }}
            onBlur={e => { const v = e.target.value.trim(); if (v && v !== task.title) onRename?.(v); else onRenameCancel?.(); }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`text-sm ${isDone ? "line-through text-gray-500" : isBlocked ? "text-gray-500" : TC.text}`}>{task.title}</span>
        )}
        {isBlocked && task.status !== "done" && (
          <span className="ml-2 text-xs text-yellow-400/70" title={`${t("task.dependsOn")} ${task.dependsOn}`}>
            <Lock size={10} className="inline" /> {t("flow.blocked")}
          </span>
        )}
        {!isBlocked && task.dependsOn && task.status !== "done" && (
          <span className="ml-2 text-xs text-emerald-400/70" title={`${t("task.dependsOn")} ${task.dependsOn}`}>
            <Check size={10} className="inline" /> {t("task.dependsOn")}
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {task.tags.map(tag => <span key={tag} className="text-xs text-sky-400/80 bg-sky-400/10 px-1.5 py-0.5 rounded">#{tag}</span>)}
          {task.due        && (
            <span className={`text-xs flex items-center gap-1 ${level ? OVERDUE_DATE_CLS[level] : "text-violet-400"}`}>
              <Calendar size={10} />
              {level && level !== "today" && <AlertTriangle size={10} />}
              {fmtDate(task.due, settings?.dateFormat, locale)}
            </span>
          )}
          {task.recurrence && <span className="text-xs text-teal-400" title={humanRecurrence(task.recurrence, locale) ?? task.recurrence}><Repeat size={10} /></span>}
          {task.flowId     && <span className="text-xs text-pink-400/80 bg-pink-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><Zap size={10} />{task.flowId}</span>}
        </div>
      )}
      {compact && task.recurrence && (
        <span className="text-xs text-teal-400/70 flex-shrink-0" title={task.recurrence}><Repeat size={10} /></span>
      )}
      {task.notes && task.notes.length > 0 && (() => {
        const MAX = 500;
        const joined = task.notes.map((n: any) => n.content || "").filter(Boolean).join("\n\n---\n\n");
        const tooltip = joined.length > MAX ? joined.slice(0, MAX) + "…" : joined;
        return (
          <span className="text-xs text-amber-400/70 flex-shrink-0 inline-flex items-center p-1 -m-1" title={tooltip || `${task.notes.length} note${task.notes.length > 1 ? "s" : ""}`}><FileText size={12} /></span>
        );
      })()}
    </div>
  );
}
