/**
 * @module FlowView
 * @description Renders a visual flow/dependency-tree view for tasks belonging to
 * a named flow. Displays progress bar, inline metadata editing (description,
 * color, deadline), and a horizontally-scrollable dependency graph where each
 * node shows status, priority, and readiness.
 *
 * @param {Object}   props
 * @param {Array}    props.tasks        - Full task list (used to resolve deps and filter by flowId).
 * @param {string}   props.activeFlow   - The name/id of the currently selected flow.
 * @param {Function} [props.onStartNext]  - Callback to start the next ready task.
 * @param {Function} [props.onUpdateFlow] - Callback to persist flow metadata edits.
 * @param {Function} [props.onDeleteFlow] - Callback to delete the flow entirely.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "./AppContext";
import { PriorityBadge } from "./badges";
import {
  ArrowRight,
  Lock,
  Zap,
  Play,
  Edit3,
  Trash2,
  Calendar,
  Check,
  X,
  CheckCircle,
  RotateCcw,
  Pencil,
  Unlink,
  XCircle,
} from "lucide-react";

import type { Task, TaskId, FlowMeta } from "../types";

interface FlowViewProps {
  tasks: Task[];
  activeFlow: string;
  onStartNext?: (taskId: TaskId) => void;
  onUpdateFlow?: (name: string, changes: Partial<FlowMeta>) => void;
  onDeleteFlow?: (name: string) => void;
  onCompleteTask?: (taskId: TaskId) => void;
  onReopenTask?: (taskId: TaskId) => void;
  onEditTask?: (taskId: TaskId) => void;
  onDeleteTask?: (taskId: TaskId) => void;
  onRemoveFromFlow?: (taskId: TaskId) => void;
  onRemoveDependency?: (taskId: TaskId) => void;
}

export function FlowView({ tasks, activeFlow, onStartNext, onUpdateFlow, onDeleteFlow, onCompleteTask, onReopenTask, onEditTask, onDeleteTask, onRemoveFromFlow, onRemoveDependency }: FlowViewProps) {
  const { t, TC, flowMeta } = useApp();
  const meta = flowMeta[activeFlow] || {};
  const flowTasks = tasks.filter(t => t.flowId === activeFlow);
  if (!flowTasks.length && !meta.description) return null;

  const doneSet = new Set(tasks.filter(t => t.status === "done").map(t => t.id));

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, task }
  const ctxRef = useRef(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e) => { if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null); };
    const esc = (e) => { if (e.key === "Escape") setCtxMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [ctxMenu]);

  const handleNodeContext = useCallback((e, task) => {
    e.preventDefault();
    const rect = e.currentTarget.closest(".flow-view-root")?.getBoundingClientRect() || { left: 0, top: 0 };
    setCtxMenu({ x: e.clientX, y: e.clientY, task });
  }, []);

  // Is a task blocked within this flow?
  const isBlocked = (task) => task.dependsOn && !doneSet.has(task.dependsOn);
  // Ready = inbox + not blocked (all deps done)
  const isReady = (task) => task.status === "inbox" && !isBlocked(task);

  const roots = flowTasks.filter(t => !t.dependsOn || !flowTasks.some(ft => ft.id === t.dependsOn));
  const dependents = {};
  flowTasks.forEach(t => {
    if (t.dependsOn) {
      const parent = flowTasks.find(ft => ft.id === t.dependsOn);
      if (parent) { dependents[parent.id] = dependents[parent.id] || []; dependents[parent.id].push(t); }
    }
  });

  const doneCount = flowTasks.filter(t => t.status === "done").length;
  const totalCount = flowTasks.length;
  const pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const barColor = meta.color || "#f472b6";
  const nextReady = flowTasks.find(isReady);

  // Inline editing state
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(meta.description || "");
  const [editColor, setEditColor] = useState(meta.color || "");
  const [editDeadline, setEditDeadline] = useState(meta.deadline || "");

  const FLOW_COLORS = ["#f472b6", "#fb923c", "#60a5fa", "#34d399", "#a78bfa", "#f87171", "#fbbf24", "#2dd4bf", "#e879f9", ""];

  const handleSaveMeta = () => {
    if (onUpdateFlow) onUpdateFlow(activeFlow, { description: editDesc, color: editColor, deadline: editDeadline || null });
    setEditing(false);
  };

  const renderNode = (task, depth = 0) => {
    const children = dependents[task.id] || [];
    const blocked = isBlocked(task);
    const ready = isReady(task);
    const sc = ready
      ? "border-amber-400 bg-amber-900/20 ring-1 ring-amber-400/30"
      : blocked && task.status !== "done"
      ? "border-gray-600 bg-gray-800/50 opacity-60"
      : { inbox: "border-gray-500 bg-gray-800", active: "border-sky-500 bg-sky-900/30", done: "border-emerald-500 bg-emerald-900/30", cancelled: "border-red-500 bg-red-900/20" }[task.status];
    return (
      <div key={task.id} className="flex items-start gap-2">
        {depth > 0 && <div className="flex items-center text-gray-600 pt-3"><ArrowRight size={14} /></div>}
        <div className={`border rounded-lg px-3 py-2 min-w-[10rem] cursor-context-menu ${sc}`}
          onContextMenu={(e) => handleNodeContext(e, task)}
          onDoubleClick={() => onEditTask?.(task.id)}>
          <div className="flex items-center gap-2">
            {blocked && task.status !== "done" && <Lock size={11} className="text-yellow-500/70" />}
            <PriorityBadge priority={task.priority} />
            <span className={`text-sm ${task.status === "done" ? "line-through text-gray-500" : blocked ? "text-gray-500" : "text-gray-100"}`}>{task.title}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            {t("status." + task.status)}
            {ready && <span className="text-amber-400 font-medium">— {t("flow.readyHint")}</span>}
          </div>
        </div>
        {children.length > 0 && <div className="flex items-start gap-2">{children.map(c => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="mt-4 p-4 bg-gray-800/30 border border-gray-700/50 rounded-xl flow-view-root relative">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Zap size={14} style={meta.color ? { color: meta.color } : {}} className={meta.color ? "" : "text-pink-400"} />
        <h3 className="text-sm font-semibold flex-1" style={meta.color ? { color: meta.color } : { color: "#f472b6" }}>Flow: {activeFlow}</h3>
        {nextReady && onStartNext && (
          <button onClick={() => onStartNext(nextReady.id)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors">
            <Play size={11} /> {t("flow.startNext")}
          </button>
        )}
        <button onClick={() => { setEditDesc(meta.description || ""); setEditColor(meta.color || ""); setEditDeadline(meta.deadline || ""); setEditing(!editing); }}
          className={`p-1 rounded transition-colors ${TC.textMuted} ${TC.hoverBg}`} title={t("flow.editMeta")}>
          <Edit3 size={13} />
        </button>
        {onDeleteFlow && (
          <button onClick={() => { if (confirm(t("flow.deleteConfirm").replace("{name}", activeFlow))) onDeleteFlow(activeFlow); }}
            className={`p-1 rounded transition-colors text-red-400/60 hover:text-red-400 ${TC.hoverBg}`} title={t("flow.deleteFlow")}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Meta info */}
      {!editing && (meta.description || meta.deadline) && (
        <div className="mb-3 space-y-1">
          {meta.description && <p className={`text-xs ${TC.textMuted}`}>{meta.description}</p>}
          {meta.deadline && <p className="text-xs text-violet-400 flex items-center gap-1"><Calendar size={10} /> {t("flow.deadline")}: {meta.deadline}</p>}
        </div>
      )}

      {/* Inline edit */}
      {editing && (
        <div className={`mb-3 p-3 rounded-lg border space-y-2 ${TC.elevated} ${TC.borderClass}`}>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.description")}</label>
            <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
              className={`w-full mt-1 px-2 py-1 text-sm rounded border ${TC.input} ${TC.borderClass}`}
              placeholder={t("flow.noDescription")} />
          </div>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.deadline")}</label>
            <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)}
              className={`w-full mt-1 px-2 py-1 text-sm rounded border ${TC.input} ${TC.borderClass}`} />
          </div>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.color")}</label>
            <div className="flex gap-1.5 mt-1">
              {FLOW_COLORS.map(c => (
                <button key={c || "none"} onClick={() => setEditColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${editColor === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{ background: c || "rgba(255,255,255,.1)" }}
                  title={c || "Default"} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSaveMeta}
              className="px-3 py-1 text-xs rounded bg-sky-600 text-white hover:bg-sky-500 transition-colors">
              <Check size={12} className="inline mr-1" />OK
            </button>
            <button onClick={() => setEditing(false)}
              className={`px-3 py-1 text-xs rounded ${TC.textMuted} ${TC.hoverBg}`}>
              <X size={12} className="inline mr-1" />{t("settings.danger.cancelBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={TC.textMuted}>{t("flow.progress")}</span>
            <span className={TC.textMuted}>{doneCount}/{totalCount} ({pct}%)</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        </div>
      )}

      {/* Dependency tree */}
      {flowTasks.length > 0 && (
        <div className="flex items-start gap-2 overflow-x-auto pb-2">{roots.map(r => renderNode(r))}</div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          className={`fixed z-50 py-1 rounded-lg shadow-xl border min-w-[180px] text-sm ${TC.elevated} ${TC.borderClass}`}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          {ctxMenu.task.status === "done" ? (
            <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-sky-400`}
              onClick={() => { onReopenTask?.(ctxMenu.task.id); setCtxMenu(null); }}>
              <RotateCcw size={13} /> {t("planner.reopenTask")}
            </button>
          ) : !isBlocked(ctxMenu.task) && (
            <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-emerald-400`}
              onClick={() => { onCompleteTask?.(ctxMenu.task.id); setCtxMenu(null); }}>
              <CheckCircle size={13} /> {t("planner.completeTask")}
            </button>
          )}
          {isReady(ctxMenu.task) && onStartNext && (
            <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-amber-400`}
              onClick={() => { onStartNext(ctxMenu.task.id); setCtxMenu(null); }}>
              <Play size={13} /> {t("flow.startNext")}
            </button>
          )}
          <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.text}`}
            onClick={() => { onEditTask?.(ctxMenu.task.id); setCtxMenu(null); }}>
            <Pencil size={13} /> {t("planner.editTask")}
          </button>
          <div className={`my-1 border-t ${TC.borderClass}`} />
          {ctxMenu.task.dependsOn && (
            <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.textSec}`}
              onClick={() => { onRemoveDependency?.(ctxMenu.task.id); setCtxMenu(null); }}>
              <Unlink size={13} /> {t("flow.removeDep")}
            </button>
          )}
          <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.textSec}`}
            onClick={() => { onRemoveFromFlow?.(ctxMenu.task.id); setCtxMenu(null); }}>
            <XCircle size={13} /> {t("flow.removeFromFlow")}
          </button>
          <div className={`my-1 border-t ${TC.borderClass}`} />
          <button className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-red-400`}
            onClick={() => { onDeleteTask?.(ctxMenu.task.id); setCtxMenu(null); }}>
            <Trash2 size={13} /> {t("ctx.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
