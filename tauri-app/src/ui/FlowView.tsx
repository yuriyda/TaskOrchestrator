/**
 * @module FlowView
 * @description DAG visualization for flow tasks using @xyflow/react.
 * Renders a directed acyclic graph where arrows point blocker → blocked task.
 * Supports context menu, double-click edit, and handle-drag to create new dependencies.
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node as RFNode,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useApp } from "./AppContext";
import { PriorityBadge } from "./badges";
import {
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
  onRemoveDependency?: (taskId: TaskId, depId: TaskId) => void;
  onSetDependency?: (taskId: TaskId, newDepId: TaskId) => void;
  onSelectTask?: (taskId: TaskId) => void;
}

// ─── Topological layout ────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 76;
const COL_GAP = 80;
const ROW_GAP = 18;

function computeLayout(
  tasks: Task[],
  getDeps: (t: Task) => TaskId[]
): { positions: Record<string, { x: number; y: number }>; height: number } {
  if (tasks.length === 0) return { positions: {}, height: 180 };

  const taskMap = new Map<string, Task>(tasks.map(t => [String(t.id), t]));
  const ranks = new Map<string, number>();

  const rankOf = (id: string): number => {
    if (ranks.has(id)) return ranks.get(id)!;
    const task = taskMap.get(id);
    if (!task) { ranks.set(id, 0); return 0; }
    const inFlow = getDeps(task).map(String).filter(d => taskMap.has(d));
    const r = inFlow.length === 0 ? 0 : Math.max(...inFlow.map(rankOf)) + 1;
    ranks.set(id, r);
    return r;
  };

  tasks.forEach(t => rankOf(String(t.id)));

  // Group by rank
  const byRank: Record<number, string[]> = {};
  tasks.forEach(t => {
    const r = ranks.get(String(t.id)) ?? 0;
    (byRank[r] ??= []).push(String(t.id));
  });

  const maxInCol = Math.max(...Object.values(byRank).map(ids => ids.length), 1);

  // Assign positions, centering each column vertically
  const positions: Record<string, { x: number; y: number }> = {};
  Object.entries(byRank).forEach(([rStr, ids]) => {
    const r = Number(rStr);
    const colH = ids.length * (NODE_H + ROW_GAP) - ROW_GAP;
    const maxH = maxInCol * (NODE_H + ROW_GAP) - ROW_GAP;
    const topPad = (maxH - colH) / 2;
    ids.forEach((id, i) => {
      positions[id] = {
        x: r * (NODE_W + COL_GAP),
        y: topPad + i * (NODE_H + ROW_GAP),
      };
    });
  });

  return {
    positions,
    height: Math.max(180, maxInCol * (NODE_H + ROW_GAP) + 48),
  };
}

// ─── Custom node ───────────────────────────────────────────────────────────────

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  blocked: boolean;
  ready: boolean;
  t: (key: string) => string;
  canConnect: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

export type TaskRFNode = RFNode<TaskNodeData, "task">;

const TaskNode = memo(function TaskNode({ data, isConnectable }: NodeProps<TaskRFNode>) {
  const { task, blocked, ready, t, canConnect, onContextMenu, onDoubleClick } = data;

  const sc =
    ready
      ? "border-amber-400 bg-amber-900/20 ring-1 ring-amber-400/30"
      : blocked && task.status !== "done"
      ? "border-gray-600 bg-gray-800/50 opacity-60"
      : ({
          inbox: "border-gray-500 bg-gray-800",
          active: "border-sky-500 bg-sky-900/30",
          done: "border-emerald-500 bg-emerald-900/30",
          cancelled: "border-red-500 bg-red-900/20",
        } as Record<string, string>)[task.status] ?? "border-gray-500 bg-gray-800";

  return (
    <div
      className={`border rounded-lg px-3 py-2 select-none transition-colors cursor-context-menu ${sc}`}
      style={{ width: NODE_W }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e); }}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onDoubleClick(); }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={canConnect && isConnectable}
        className="!w-3 !h-3 !bg-slate-600 !border-slate-400"
      />
      <div className="flex items-center gap-1.5 overflow-hidden">
        {blocked && task.status !== "done" && (
          <Lock size={11} className="text-yellow-500/70 flex-shrink-0" />
        )}
        <PriorityBadge priority={task.priority} />
        <span
          className={`text-sm leading-tight truncate ${
            task.status === "done"
              ? "line-through text-gray-500"
              : blocked
              ? "text-gray-500"
              : "text-gray-100"
          }`}
        >
          {task.title}
        </span>
      </div>
      <div className="text-xs text-gray-500 mt-1 leading-tight">
        {t("status." + task.status)}
        {ready && (
          <span className="text-amber-400 font-medium ml-1">
            — {t("flow.readyHint")}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={canConnect && isConnectable}
        className="!w-3 !h-3 !bg-slate-600 !border-slate-400"
      />
    </div>
  );
});

const nodeTypes = { task: TaskNode };

// ─── FlowView ──────────────────────────────────────────────────────────────────

export function FlowView({
  tasks,
  activeFlow,
  onStartNext,
  onUpdateFlow,
  onDeleteFlow,
  onCompleteTask,
  onReopenTask,
  onEditTask,
  onDeleteTask,
  onRemoveFromFlow,
  onRemoveDependency,
  onSetDependency,
  onSelectTask,
}: FlowViewProps) {
  const { t, TC, flowMeta } = useApp();

  // ── All hooks first (before any early returns) ────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; task: Task } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDeadline, setEditDeadline] = useState("");

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Element)) setCtxMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [ctxMenu]);

  const meta = flowMeta[activeFlow] || {};
  const flowTasks = tasks.filter(t => t.flowId === activeFlow);
  const doneSet = new Set(tasks.filter(t => t.status === "done").map(t => t.id));

  const getDeps = (task: Task): TaskId[] => task.dependsOn ?? [];
  const isBlocked = (task: Task) => getDeps(task).some(id => !doneSet.has(id));
  const isReady = (task: Task) => task.status === "inbox" && !isBlocked(task);

  const handleConnect = useCallback(
    (connection: Connection) => {
      // Arrow direction: source (blocker) → target (blocked task)
      if (connection.source && connection.target) {
        onSetDependency?.(connection.target as TaskId, connection.source as TaskId);
      }
    },
    [onSetDependency]
  );

  // ── Early return after all hooks ──────────────────────────────────────────
  if (!flowTasks.length && !meta.description) return null;

  // ── Layout ────────────────────────────────────────────────────────────────
  const { positions, height } = computeLayout(flowTasks, getDeps);

  // ── Key for uncontrolled ReactFlow (remount when deps/status change) ────────
  const rfKey = flowTasks.map(t => `${String(t.id)}:${t.status}:${JSON.stringify(t.dependsOn)}`).join("|");

  // ── React Flow nodes ──────────────────────────────────────────────────────
  const rfNodes: TaskRFNode[] = flowTasks.map(task => ({
    id: String(task.id),
    type: "task" as const,
    position: positions[String(task.id)] ?? { x: 0, y: 0 },
    data: {
      task,
      blocked: isBlocked(task),
      ready: isReady(task),
      t,
      canConnect: !!onSetDependency,
      onContextMenu: (e: React.MouseEvent) => setCtxMenu({ x: e.clientX, y: e.clientY, task }),
      onDoubleClick: () => onEditTask?.(task.id),
    },
    draggable: false,
  }));

  // ── React Flow edges ──────────────────────────────────────────────────────
  const rfEdges: Edge[] = flowTasks.flatMap(task =>
    getDeps(task)
      .filter(depId => flowTasks.some(ft => ft.id === depId))
      .map(depId => ({
        id: `${String(depId)}->${String(task.id)}`,
        source: String(depId),
        target: String(task.id),
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: { stroke: "#6b7280", strokeWidth: 1.5 },
      }))
  );

  // ── Progress ──────────────────────────────────────────────────────────────
  const doneCount = flowTasks.filter(t => t.status === "done").length;
  const totalCount = flowTasks.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const barColor = meta.color || "#f472b6";
  const nextReady = flowTasks.find(isReady);

  const FLOW_COLORS = [
    "#f472b6", "#fb923c", "#60a5fa", "#34d399",
    "#a78bfa", "#f87171", "#fbbf24", "#2dd4bf", "#e879f9", "",
  ];

  const handleSaveMeta = () => {
    onUpdateFlow?.(activeFlow, {
      description: editDesc,
      color: editColor,
      deadline: editDeadline || null,
    });
    setEditing(false);
  };

  return (
    <div className="mt-4 p-4 bg-gray-800/30 border border-gray-700/50 rounded-xl flow-view-root relative">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Zap
          size={14}
          style={meta.color ? { color: meta.color } : {}}
          className={meta.color ? "" : "text-pink-400"}
        />
        <h3
          className="text-sm font-semibold flex-1"
          style={meta.color ? { color: meta.color } : { color: "#f472b6" }}
        >
          Flow: {activeFlow}
        </h3>
        {nextReady && onStartNext && (
          <button
            onClick={() => onStartNext(nextReady.id)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            <Play size={11} /> {t("flow.startNext")}
          </button>
        )}
        <button
          onClick={() => {
            setEditDesc(meta.description || "");
            setEditColor(meta.color || "");
            setEditDeadline(meta.deadline || "");
            setEditing(v => !v);
          }}
          className={`p-1 rounded transition-colors ${TC.textMuted} ${TC.hoverBg}`}
          title={t("flow.editMeta")}
        >
          <Edit3 size={13} />
        </button>
        {onDeleteFlow && (
          <button
            onClick={() => {
              if (confirm(t("flow.deleteConfirm").replace("{name}", activeFlow)))
                onDeleteFlow(activeFlow);
            }}
            className={`p-1 rounded transition-colors text-red-400/60 hover:text-red-400 ${TC.hoverBg}`}
            title={t("flow.deleteFlow")}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Meta info */}
      {!editing && (meta.description || meta.deadline) && (
        <div className="mb-3 space-y-1">
          {meta.description && (
            <p className={`text-xs ${TC.textMuted}`}>{meta.description}</p>
          )}
          {meta.deadline && (
            <p className="text-xs text-violet-400 flex items-center gap-1">
              <Calendar size={10} /> {t("flow.deadline")}: {meta.deadline}
            </p>
          )}
        </div>
      )}

      {/* Inline edit */}
      {editing && (
        <div className={`mb-3 p-3 rounded-lg border space-y-2 ${TC.elevated} ${TC.borderClass}`}>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.description")}</label>
            <input
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className={`w-full mt-1 px-2 py-1 text-sm rounded border ${TC.input} ${TC.borderClass}`}
              placeholder={t("flow.noDescription")}
            />
          </div>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.deadline")}</label>
            <input
              type="date"
              value={editDeadline}
              onChange={e => setEditDeadline(e.target.value)}
              className={`w-full mt-1 px-2 py-1 text-sm rounded border ${TC.input} ${TC.borderClass}`}
            />
          </div>
          <div>
            <label className={`text-xs font-medium ${TC.textMuted}`}>{t("flow.color")}</label>
            <div className="flex gap-1.5 mt-1">
              {FLOW_COLORS.map(c => (
                <button
                  key={c || "none"}
                  onClick={() => setEditColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    editColor === c ? "border-white scale-110" : "border-transparent"
                  }`}
                  style={{ background: c || "rgba(255,255,255,.1)" }}
                  title={c || "Default"}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveMeta}
              className="px-3 py-1 text-xs rounded bg-sky-600 text-white hover:bg-sky-500 transition-colors"
            >
              <Check size={12} className="inline mr-1" />OK
            </button>
            <button
              onClick={() => setEditing(false)}
              className={`px-3 py-1 text-xs rounded ${TC.textMuted} ${TC.hoverBg}`}
            >
              <X size={12} className="inline mr-1" />
              {t("settings.danger.cancelBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={TC.textMuted}>{t("flow.progress")}</span>
            <span className={TC.textMuted}>
              {doneCount}/{totalCount} ({pct}%)
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
        </div>
      )}

      {/* DAG canvas */}
      {flowTasks.length > 0 && (
        <div
          style={{ height, "--xy-background-color": "#0f172a" } as React.CSSProperties}
          className="rounded-lg overflow-hidden"
        >
          <ReactFlow
            key={rfKey}
            defaultNodes={rfNodes}
            defaultEdges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onSelectTask ? (_event, node) => onSelectTask(node.id as TaskId) : undefined}
            onConnect={onSetDependency ? handleConnect : undefined}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            colorMode="dark"
            nodesDraggable={false}
            nodesConnectable={!!onSetDependency}
            panOnDrag={true}
            zoomOnScroll={false}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            minZoom={0.4}
            maxZoom={2}
            connectionLineStyle={{ stroke: "#38bdf8", strokeWidth: 1.5 }}
            connectionLineType="smoothstep"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#1e293b"
              gap={20}
              size={1}
            />
          </ReactFlow>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className={`fixed z-50 py-1 rounded-lg shadow-xl border min-w-[180px] text-sm ${TC.elevated} ${TC.borderClass}`}
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {ctxMenu.task.status === "done" ? (
            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-sky-400"
              onClick={() => { onReopenTask?.(ctxMenu.task.id); setCtxMenu(null); }}
            >
              <RotateCcw size={13} /> {t("planner.reopenTask")}
            </button>
          ) : !isBlocked(ctxMenu.task) && (
            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-emerald-400"
              onClick={() => { onCompleteTask?.(ctxMenu.task.id); setCtxMenu(null); }}
            >
              <CheckCircle size={13} /> {t("planner.completeTask")}
            </button>
          )}
          {isReady(ctxMenu.task) && onStartNext && (
            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-amber-400"
              onClick={() => { onStartNext(ctxMenu.task.id); setCtxMenu(null); }}
            >
              <Play size={13} /> {t("flow.startNext")}
            </button>
          )}
          <button
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.text}`}
            onClick={() => { onEditTask?.(ctxMenu.task.id); setCtxMenu(null); }}
          >
            <Pencil size={13} /> {t("planner.editTask")}
          </button>
          <div className={`my-1 border-t ${TC.borderClass}`} />
          {getDeps(ctxMenu.task).map(depId => {
            const depTask = tasks.find(dt => dt.id === depId);
            return (
              <button
                key={String(depId)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.textSec}`}
                onClick={() => { onRemoveDependency?.(ctxMenu.task.id, depId); setCtxMenu(null); }}
              >
                <Unlink size={13} /> {t("flow.removeDep")}:{" "}
                {depTask?.title?.slice(0, 20) || String(depId)}
              </button>
            );
          })}
          <button
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 ${TC.textSec}`}
            onClick={() => { onRemoveFromFlow?.(ctxMenu.task.id); setCtxMenu(null); }}
          >
            <XCircle size={13} /> {t("flow.removeFromFlow")}
          </button>
          <div className={`my-1 border-t ${TC.borderClass}`} />
          <button
            className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-white/10 text-red-400"
            onClick={() => { onDeleteTask?.(ctxMenu.task.id); setCtxMenu(null); }}
          >
            <Trash2 size={13} /> {t("ctx.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
