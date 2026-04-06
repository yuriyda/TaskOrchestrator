/**
 * @file DayPlanner.jsx
 * Day Planner panel — shows a daily time grid where tasks can be dragged into time slots.
 * Displays week tabs for navigation, current time indicator, blocked slots, and summary footer.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Clock, ChevronLeft, ChevronRight, Plus, Lock, Check, Play, Repeat, GripVertical, Trash2, Edit3, X } from "lucide-react";
import { useApp } from "./AppContext.jsx";
import { PRIORITY_COLORS } from "../core/constants.js";
import { getWeekDates, timeToMinutes, minutesToTime, snapToGrid } from "../store/dayPlanner.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // pixels per hour
const DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// ─── Component ──────────────────────────────────────────────────────────────

export function DayPlanner({
  slots,
  currentPlan,
  tasks,
  selectedDate,
  onSelectDate,
  onDropTask,
  onMoveSlot,
  onResizeSlot,
  onRemoveSlot,
  onBlockSlot,
  onUnblockSlot,
  onUpdateSlotTitle,
  onUpdateSlotRecurrence,
  onCompleteTask,
  onEditTask,
  onCreateTaskHere,
  onSelectTask,
  slotStep = 30,
  settingsDayStart,
  settingsDayEnd,
}) {
  const { t, TC, locale } = useApp();
  const gridRef = useRef(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const [contextMenu, setContextMenu] = useState(null);
  const [editingTitle, setEditingTitle] = useState(null); // slotId being edited
  const [titleDraft, setTitleDraft] = useState("");
  const [recurrenceDraft, setRecurrenceDraft] = useState(null);
  const [resizing, setResizing] = useState(null); // { slotId, startY, originalEndMinutes }
  const [draggingSlot, setDraggingSlot] = useState(null); // { slotId, startY, originalStartMinutes, duration }

  // Settings props override plan values for immediate reactivity
  const dayStartHour = settingsDayStart ?? currentPlan?.dayStartHour ?? 9;
  const dayEndHour = settingsDayEnd ?? currentPlan?.dayEndHour ?? 17;
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  const totalHeight = (dayEndHour - dayStartHour) * HOUR_HEIGHT;

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Week dates
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dayNames = locale === "ru" ? DAY_NAMES_RU : DAY_NAMES_EN;

  // ─── Position helpers ─────────────────────────────────────────────────────

  const minutesToY = useCallback((min) => {
    return ((min - dayStartHour * 60) / 60) * HOUR_HEIGHT;
  }, [dayStartHour]);

  const yToMinutes = useCallback((y) => {
    return dayStartHour * 60 + (y / HOUR_HEIGHT) * 60;
  }, [dayStartHour]);

  // ─── Collision avoidance: find free start time that doesn't overlap blocked slots ─

  // Pre-compute ALL occupied ranges for collision avoidance (excludeId = slot being dragged)
  const getOccupiedRanges = useCallback((excludeId) =>
    slots
      .filter(s => s.id !== excludeId)
      .map(s => ({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) }))
      .sort((a, b) => a.start - b.start),
    [slots]
  );

  // Occupied ranges for external drops (all slots occupied)
  const allOccupied = useMemo(() => getOccupiedRanges(null), [getOccupiedRanges]);

  const findFreeStart = useCallback((startMin, durationMin, occupied) => {
    const ranges = occupied || allOccupied;
    const startLimit = dayStartHour * 60;
    const endLimit = dayEndHour * 60;
    let candidate = startMin;

    // Push forward past overlapping ranges
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of ranges) {
        if (candidate < b.end && candidate + durationMin > b.start) {
          candidate = snapToGrid(b.end, slotStep);
          changed = true;
        }
      }
    }

    // If pushed past day end, try placing before the first collision instead
    if (candidate + durationMin > endLimit) {
      candidate = startMin;
      // Find the collision that blocks us and place just before it
      for (const b of ranges) {
        if (candidate < b.end && candidate + durationMin > b.start) {
          candidate = snapToGrid(b.start - durationMin, slotStep);
          break;
        }
      }
    }

    return Math.max(startLimit, Math.min(candidate, endLimit - durationMin));
  }, [allOccupied, dayStartHour, dayEndHour, slotStep]);

  // ─── Drag over / Drop handler (for tasks dragged from task list) ──────────

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // Task IDs already scheduled in planner (for duplicate prevention)
  const scheduledTaskIds = useMemo(() => new Set(slots.filter(s => s.taskId).map(s => s.taskId)), [slots]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const taskIds = e.dataTransfer.getData("text/task-ids");
    if (!taskIds) return;

    // Filter out tasks already in the planner
    const ids = taskIds.split(",").filter(id => !scheduledTaskIds.has(id));
    if (ids.length === 0) return;

    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + (gridRef.current.scrollTop || 0);
    const rawMinutes = yToMinutes(y);
    const snappedMinutes = snapToGrid(rawMinutes, slotStep);
    const clampedMinutes = Math.max(dayStartHour * 60, Math.min(snappedMinutes, (dayEndHour - 1) * 60));
    const startTime = minutesToTime(clampedMinutes);

    // Pass current slots for collision detection (avoids stale closure in parent)
    onDropTask(ids, startTime, slots);
  }, [yToMinutes, slotStep, dayStartHour, dayEndHour, onDropTask, scheduledTaskIds, slots]);

  // ─── Internal slot drag (move within planner) ─────────────────────────────

  const handleSlotMouseDown = useCallback((e, slot) => {
    if (e.button !== 0) return;
    if (e.target.closest(".resize-handle")) return;
    e.preventDefault();
    e.stopPropagation();
    const startMin = timeToMinutes(slot.startTime);
    const endMin = timeToMinutes(slot.endTime);
    setDraggingSlot({
      slotId: slot.id,
      startY: e.clientY,
      originalStartMinutes: startMin,
      duration: endMin - startMin,
    });
  }, []);

  useEffect(() => {
    if (!draggingSlot) return;

    // Occupied ranges excluding the slot being dragged
    const occupied = getOccupiedRanges(draggingSlot.slotId);

    // Floating ghost for drag-out
    let ghost = null;

    const handleMouseMove = (e) => {
      const el = document.querySelector(`[data-slot-id="${draggingSlot.slotId}"]`);
      if (!el) return;

      const gridRect = gridRef.current?.getBoundingClientRect();
      const isOutside = gridRect && (e.clientX < gridRect.left - 20 || e.clientX > gridRect.right + 20);

      // Show/hide floating ghost when outside grid
      if (isOutside && !ghost) {
        ghost = document.createElement("div");
        const slot = slots.find(s => s.id === draggingSlot.slotId);
        const task = slot?.taskId ? tasks.find(t => t.id === slot.taskId) : null;
        ghost.textContent = task?.title || slot?.title || "—";
        Object.assign(ghost.style, {
          position: "fixed", zIndex: "99999", pointerEvents: "none",
          width: "180px", padding: "8px 12px", borderRadius: "6px",
          fontSize: "12px", fontWeight: "500", fontFamily: "monospace",
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.5)",
          color: "#fca5a5", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        });
        document.body.appendChild(ghost);
      }
      if (!isOutside && ghost) {
        ghost.remove();
        ghost = null;
      }
      if (ghost) {
        ghost.style.left = `${e.clientX - 90}px`;
        ghost.style.top = `${e.clientY - 20}px`;
      }

      el.style.opacity = isOutside ? "0.2" : "0.7";

      const deltaY = e.clientY - draggingSlot.startY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;
      const rawStart = snapToGrid(draggingSlot.originalStartMinutes + deltaMinutes, slotStep);
      const clampedStart = Math.max(dayStartHour * 60, Math.min(rawStart, dayEndHour * 60 - draggingSlot.duration));
      const freeStart = findFreeStart(clampedStart, draggingSlot.duration, occupied);
      const freeEnd = freeStart + draggingSlot.duration;

      el.style.top = `${minutesToY(freeStart)}px`;
      el.style.height = `${(draggingSlot.duration / 60) * HOUR_HEIGHT}px`;
      el.dataset.previewStart = minutesToTime(freeStart);
      el.dataset.previewEnd = minutesToTime(freeEnd);
    };
    const handleMouseUp = (e) => {
      if (ghost) { ghost.remove(); ghost = null; }
      // If released outside the planner grid → remove slot from plan
      const gridRect = gridRef.current?.getBoundingClientRect();
      if (gridRect && (e.clientX < gridRect.left || e.clientX > gridRect.right ||
                       e.clientY < gridRect.top || e.clientY > gridRect.bottom)) {
        onRemoveSlot(draggingSlot.slotId);
        setDraggingSlot(null);
        return;
      }
      const el = document.querySelector(`[data-slot-id="${draggingSlot.slotId}"]`);
      if (el && el.dataset.previewStart) {
        onMoveSlot(draggingSlot.slotId, el.dataset.previewStart, el.dataset.previewEnd);
        delete el.dataset.previewStart;
        delete el.dataset.previewEnd;
      }
      setDraggingSlot(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingSlot, slotStep, dayStartHour, dayEndHour, minutesToY, onMoveSlot, getOccupiedRanges, findFreeStart]);

  // ─── Resize handler ──────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e, slot) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      slotId: slot.id,
      startY: e.clientY,
      originalEndMinutes: timeToMinutes(slot.endTime),
    });
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      const deltaY = e.clientY - resizing.startY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;
      const newEnd = snapToGrid(resizing.originalEndMinutes + deltaMinutes, slotStep);
      const slotEl = document.querySelector(`[data-slot-id="${resizing.slotId}"]`);
      if (!slotEl) return;
      const startMin = timeToMinutes(slotEl.dataset.startTime || "00:00");
      const clampedEnd = Math.max(startMin + slotStep, Math.min(newEnd, dayEndHour * 60));
      slotEl.style.height = `${((clampedEnd - startMin) / 60) * HOUR_HEIGHT}px`;
      slotEl.dataset.previewEnd = minutesToTime(clampedEnd);
    };
    const handleMouseUp = () => {
      const el = document.querySelector(`[data-slot-id="${resizing.slotId}"]`);
      if (el && el.dataset.previewEnd) {
        onResizeSlot(resizing.slotId, el.dataset.previewEnd);
        delete el.dataset.previewEnd;
      }
      setResizing(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, slotStep, dayEndHour, onResizeSlot]);

  // ─── Context menu ─────────────────────────────────────────────────────────

  const handleSlotContextMenu = useCallback((e, slot) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, slot });
  }, []);

  const handleEmptyContextMenu = useCallback((e) => {
    if (e.target.closest("[data-slot-id]")) return;
    e.preventDefault();
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + (gridRef.current.scrollTop || 0);
    const rawMinutes = yToMinutes(y);
    const snappedMinutes = Math.floor(rawMinutes / slotStep) * slotStep;
    const time = minutesToTime(Math.max(dayStartHour * 60, snappedMinutes));
    setContextMenu({ x: e.clientX, y: e.clientY, emptyTime: time });
  }, [yToMinutes, slotStep, dayStartHour]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // ─── Double click on empty space → create task ────────────────────────────

  const handleEmptyDoubleClick = useCallback((e) => {
    if (e.target.closest("[data-slot-id]")) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + (gridRef.current.scrollTop || 0);
    const rawMinutes = yToMinutes(y);
    const snappedMinutes = Math.floor(rawMinutes / slotStep) * slotStep;
    const time = minutesToTime(Math.max(dayStartHour * 60, snappedMinutes));
    onCreateTaskHere(time);
  }, [yToMinutes, slotStep, dayStartHour, onCreateTaskHere]);

  // ─── Summary ──────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const taskSlots = slots.filter(s => s.slotType === "task");
    const blockedSlots = slots.filter(s => s.slotType === "blocked");
    const plannedMin = taskSlots.reduce((sum, s) => sum + timeToMinutes(s.endTime) - timeToMinutes(s.startTime), 0);
    const blockedMin = blockedSlots.reduce((sum, s) => sum + timeToMinutes(s.endTime) - timeToMinutes(s.startTime), 0);
    const totalAvail = totalMinutes - blockedMin;
    return {
      planned: (plannedMin / 60).toFixed(1),
      total: (totalAvail / 60).toFixed(1),
    };
  }, [slots, totalMinutes]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderHourLines = () => {
    const lines = [];
    for (let h = dayStartHour; h <= dayEndHour; h++) {
      const y = (h - dayStartHour) * HOUR_HEIGHT;
      lines.push(
        <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none" style={{ top: y }}>
          <span className={`text-[10px] w-10 text-right pr-2 -mt-1.5 flex-shrink-0 ${TC.textMuted}`}>
            {h < 10 ? `0${h}` : h}:00
          </span>
          <div className={`flex-1 border-t ${TC.borderClass} opacity-30`} />
        </div>
      );
    }
    return lines;
  };

  const renderNowLine = () => {
    if (selectedDate !== today) return null;
    const startMin = dayStartHour * 60;
    const endMin = dayEndHour * 60;
    if (nowMinutes < startMin || nowMinutes > endMin) return null;
    const y = minutesToY(nowMinutes);
    return (
      <div className="absolute left-10 right-0 z-20 pointer-events-none flex items-center" style={{ top: y }}>
        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 border-t-2 border-red-500" />
      </div>
    );
  };

  const renderSlot = (slot) => {
    const startMin = timeToMinutes(slot.startTime);
    const endMin = timeToMinutes(slot.endTime);
    const top = minutesToY(startMin);
    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
    const task = slot.taskId ? tasks.find(t => t.id === slot.taskId) : null;
    const isDone = task?.status === "done";
    const isBlocked = slot.slotType === "blocked";
    const pColor = task ? PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4] : null;

    return (
      <div
        key={slot.id}
        data-slot-id={slot.id}
        data-start-time={slot.startTime}
        className={`absolute left-10 right-1 rounded-md cursor-pointer select-none group z-10
          ${isBlocked ? "border border-dashed" : "border"}
          ${isDone ? "opacity-50" : ""}
          ${draggingSlot?.slotId === slot.id ? "opacity-70 shadow-lg" : ""}
          ${resizing?.slotId === slot.id ? "opacity-70" : ""}`}
        style={{
          top,
          height: Math.max(height, 20),
          backgroundColor: isBlocked
            ? "rgba(107,114,128,0.15)"
            : pColor
              ? `${pColor}18`
              : "rgba(14,165,233,0.12)",
          borderColor: isBlocked
            ? "rgba(107,114,128,0.4)"
            : pColor || "rgba(14,165,233,0.3)",
        }}
        onMouseDown={(e) => handleSlotMouseDown(e, slot)}
        onClick={(e) => {
          e.stopPropagation();
          if (task) onSelectTask(task.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (task) onEditTask(task.id);
          else if (isBlocked) {
            setEditingTitle(slot.id);
            setTitleDraft(slot.title || "");
            setRecurrenceDraft(slot.recurrence || null);
          }
        }}
        onContextMenu={(e) => handleSlotContextMenu(e, slot)}
      >
        {/* Left priority stripe */}
        {pColor && !isBlocked && (
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: pColor }} />
        )}

        <div className={`px-2 py-0.5 flex flex-col h-full overflow-hidden ${pColor && !isBlocked ? "pl-3" : ""}`}>
          {height < 36 ? (
            /* Compact single-line layout for short slots (≤30 min) */
            <div className="flex items-center gap-1.5 min-w-0 h-full">
              {isDone && <Check size={10} className="text-emerald-500 flex-shrink-0" />}
              {isBlocked && <Lock size={10} className="text-gray-400 flex-shrink-0" />}
              {task?.personas?.map(p => (
                <span key={p} className="text-[9px] text-indigo-400/90 bg-indigo-400/10 px-1 rounded flex-shrink-0">{p}</span>
              ))}
              <span className={`text-xs font-medium truncate flex-1
                ${isDone ? "line-through text-gray-500" : isBlocked ? "text-gray-400" : TC.text}`}>
                {isBlocked ? (slot.title || t("planner.blocked")) : (task?.title || "—")}
              </span>
              {isBlocked && slot.recurrence && <Repeat size={9} className="text-gray-400/70 flex-shrink-0" />}
              <span className={`text-[9px] flex-shrink-0 ${TC.textMuted}`}>{slot.startTime}–{slot.endTime}</span>
            </div>
          ) : (
            /* Full multi-line layout for taller slots */
            <>
              <div className="flex items-center gap-1 min-w-0">
                {isDone && <Check size={10} className="text-emerald-500 flex-shrink-0" />}
                {isBlocked && <Lock size={10} className="text-gray-400 flex-shrink-0" />}
                {task?.personas?.map(p => (
                  <span key={p} className="text-[9px] text-indigo-400/90 bg-indigo-400/10 px-1 py-0.5 rounded flex-shrink-0">{p}</span>
                ))}
                <span className={`text-xs font-medium truncate
                  ${isDone ? "line-through text-gray-500" : isBlocked ? "text-gray-400" : TC.text}`}>
                  {isBlocked ? (slot.title || t("planner.blocked")) : (task?.title || "—")}
                </span>
                {isBlocked && slot.recurrence && <Repeat size={9} className="text-gray-400/70 flex-shrink-0" />}
              </div>
              {height >= 50 && task && (
                <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                  {task.list && <span className="text-[9px] text-sky-400/70 truncate">@{task.list}</span>}
                  {task.tags?.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[9px] text-sky-400/60">#{tag}</span>
                  ))}
                </div>
              )}
              <span className={`text-[9px] mt-auto ${TC.textMuted}`}>
                {slot.startTime}–{slot.endTime}
              </span>
            </>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="resize-handle absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "linear-gradient(transparent, rgba(255,255,255,0.1))" }}
          onMouseDown={(e) => handleResizeStart(e, slot)}
        />
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full border-l ${TC.borderClass}`}>
      {/* Week tabs */}
      <div className={`flex items-center px-2 py-1.5 flex-shrink-0 border-b ${TC.borderClass}`}>
        <button
          onClick={() => {
            const prevWeekDate = new Date(weekDates[0] + "T12:00:00");
            prevWeekDate.setDate(prevWeekDate.getDate() - 7);
            onSelectDate(prevWeekDate.toISOString().slice(0, 10));
          }}
          className={`p-1 rounded hover:bg-white/5 ${TC.textMuted}`}
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex-1 flex justify-center gap-0.5">
          {weekDates.map((date, i) => {
            const day = parseInt(date.slice(8, 10));
            const isToday = date === today;
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => onSelectDate(date)}
                className={`flex flex-col items-center px-1.5 py-0.5 rounded text-[10px] leading-tight transition-colors
                  ${isSelected ? "bg-sky-500/20 text-sky-400" : isToday ? `text-sky-400 ${TC.hoverBg}` : `${TC.textMuted} ${TC.hoverBg}`}`}
              >
                <span className="font-medium">{dayNames[i]}</span>
                <span className={`text-xs ${isToday && !isSelected ? "underline decoration-sky-400" : ""}`}>{day}</span>
              </button>
            );
          })}
        </div>

        {/* Today button — visible when viewing a different week */}
        {!weekDates.includes(today) && (
          <button
            onClick={() => onSelectDate(today)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 mr-0.5"
          >
            {locale === "ru" ? "Сегодня" : "Today"}
          </button>
        )}

        <button
          onClick={() => {
            const nextWeekDate = new Date(weekDates[6] + "T12:00:00");
            nextWeekDate.setDate(nextWeekDate.getDate() + 7);
            onSelectDate(nextWeekDate.toISOString().slice(0, 10));
          }}
          className={`p-1 rounded hover:bg-white/5 ${TC.textMuted}`}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Time grid */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={handleEmptyContextMenu}
        onDoubleClick={handleEmptyDoubleClick}
      >
        <div className="relative mt-2" style={{ height: totalHeight + 24 }}>
          {renderHourLines()}
          {renderNowLine()}
          {slots.map(renderSlot)}

          {/* Empty state */}
          {slots.length === 0 && (
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${TC.textMuted} text-xs`}>
              {t("planner.noSlots")}
            </div>
          )}
        </div>
      </div>

      {/* Summary footer */}
      <div className={`flex-shrink-0 px-3 py-1.5 border-t text-[11px] flex items-center gap-2 ${TC.borderClass} ${TC.textMuted}`}>
        <Clock size={12} />
        <span>{summary.planned} / {summary.total} h {t("planner.planned")}</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={`fixed z-[9999] rounded-lg shadow-xl border py-1 min-w-[160px] ${TC.surface} ${TC.borderClass}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.slot ? (
            <>
              {contextMenu.slot.slotType === "task" && contextMenu.slot.taskId && (() => {
                const ctxTask = tasks.find(t => t.id === contextMenu.slot.taskId);
                const isDone = ctxTask?.status === "done";
                return (
                  <>
                    {isDone
                      ? <CtxItem icon={Play} label={t("planner.reopenTask")} onClick={() => onCompleteTask(contextMenu.slot.taskId)} />
                      : <CtxItem icon={Check} label={t("planner.completeTask")} onClick={() => onCompleteTask(contextMenu.slot.taskId)} />
                    }
                    <CtxItem icon={Edit3} label={t("planner.editTask")} onClick={() => onEditTask(contextMenu.slot.taskId)} />
                    <div className={`my-1 border-t ${TC.borderClass}`} />
                  </>
                );
              })()}
              {contextMenu.slot.slotType === "blocked" && (
                <>
                  <CtxItem icon={Edit3} label={t("planner.editBlock")} onClick={() => {
                    setEditingTitle(contextMenu.slot.id);
                    setTitleDraft(contextMenu.slot.title || "");
                    setRecurrenceDraft(contextMenu.slot.recurrence || null);
                  }} />
                  {/* Recurrence submenu */}
                  <div className={`px-3 py-1 text-[10px] ${TC.textMuted}`}>{t("planner.recurrence")}:</div>
                  {[
                    { value: null, label: t("planner.recNone") },
                    { value: "daily", label: t("planner.recDaily") },
                    { value: "weekly", label: t("planner.recWeekly") },
                    { value: "biweekly", label: t("planner.recBiweekly") },
                  ].map(opt => (
                    <button
                      key={opt.value || "none"}
                      onClick={() => onUpdateSlotRecurrence(contextMenu.slot.id, opt.value)}
                      className={`w-full text-left px-3 py-1 text-xs flex items-center gap-2 ${TC.hoverBg} transition-colors
                        ${contextMenu.slot.recurrence === opt.value ? "text-sky-400" : TC.text}`}
                    >
                      {contextMenu.slot.recurrence === opt.value ? <Check size={10} /> : <span className="w-[10px]" />}
                      {opt.label}
                    </button>
                  ))}
                  <div className={`my-1 border-t ${TC.borderClass}`} />
                  <CtxItem icon={Lock} label={t("planner.unblockSlot")} onClick={() => onUnblockSlot(contextMenu.slot.id)} />
                  <div className={`my-1 border-t ${TC.borderClass}`} />
                </>
              )}
              <CtxItem icon={Trash2} label={t("planner.removeFromPlan")} onClick={() => onRemoveSlot(contextMenu.slot.id)} danger />
            </>
          ) : (
            <>
              <CtxItem icon={Lock} label={t("planner.blockSlot")} onClick={() => onBlockSlot(contextMenu.emptyTime)} />
              <CtxItem icon={Plus} label={t("planner.createTaskHere")} onClick={() => onCreateTaskHere(contextMenu.emptyTime)} />
            </>
          )}
        </div>
      )}

      {/* Inline editor for blocked slots (title + recurrence) */}
      {editingTitle && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30"
             onMouseDown={e => { if (e.target === e.currentTarget) e.currentTarget.dataset.bd = "1"; }}
             onClick={e => { if (e.currentTarget.dataset.bd) { delete e.currentTarget.dataset.bd; setEditingTitle(null); } }}>
          <div className={`rounded-lg p-4 shadow-xl ${TC.surface} border ${TC.borderClass}`} onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className={`w-60 px-3 py-1.5 rounded border text-sm ${TC.input} ${TC.borderClass}`}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  onUpdateSlotTitle(editingTitle, titleDraft);
                  if (recurrenceDraft !== undefined) onUpdateSlotRecurrence(editingTitle, recurrenceDraft);
                  setEditingTitle(null);
                } else if (e.key === "Escape") {
                  setEditingTitle(null);
                }
              }}
              placeholder={t("planner.blocked")}
            />
            <div className="mt-2">
              <span className={`text-[10px] ${TC.textMuted}`}>{t("planner.recurrence")}</span>
              <div className="flex gap-1 mt-1">
                {[
                  { value: null, label: t("planner.recNone") },
                  { value: "daily", label: t("planner.recDaily") },
                  { value: "weekly", label: t("planner.recWeekly") },
                  { value: "biweekly", label: t("planner.recBiweekly") },
                ].map(opt => (
                  <button
                    key={opt.value || "none"}
                    onClick={() => setRecurrenceDraft(opt.value)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors
                      ${recurrenceDraft === opt.value ? "border-sky-400 text-sky-400 bg-sky-400/10" : `${TC.borderClass} ${TC.textMuted}`}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditingTitle(null)} className={`text-xs px-2 py-1 rounded ${TC.hoverBg} ${TC.textMuted}`}>{locale === "ru" ? "Отмена" : "Cancel"}</button>
              <button onClick={() => {
                onUpdateSlotTitle(editingTitle, titleDraft);
                if (recurrenceDraft !== undefined) onUpdateSlotRecurrence(editingTitle, recurrenceDraft);
                setEditingTitle(null);
              }} className="text-xs px-2 py-1 rounded bg-sky-500/20 text-sky-400">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Context menu item ────────────────────────────────────────────────────

function CtxItem({ icon: Icon, label, onClick, danger = false }) {
  const { TC } = useApp();
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${TC.hoverBg} transition-colors
        ${danger ? "text-red-400 hover:text-red-300" : TC.text}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
