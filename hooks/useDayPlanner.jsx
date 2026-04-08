/**
 * @file useDayPlanner.jsx
 * @description Custom hook for Day Planner integration: load day, drop tasks,
 *   move/resize/remove slots, block slots, create tasks from planner.
 *   Extracted from task-orchestrator.jsx.
 */
import { useEffect, useCallback, useRef } from "react";
import { timeToMinutes, minutesToTime } from "../tauri-app/src/store/dayPlanner.js";

function parseEstimateMinutes(estimate) {
  if (!estimate) return 60;
  const est = estimate.toLowerCase();
  const hMatch = est.match(/([\d.]+)\s*h/);
  const mMatch = est.match(/([\d.]+)\s*m/);
  let min = 60;
  if (hMatch) min = Math.round(parseFloat(hMatch[1]) * 60);
  else if (mMatch) min = Math.round(parseFloat(mMatch[1]));
  return Math.max(15, min);
}

export function useDayPlanner({ store, tasks, settings, t, handleUpdate, showPlanner, plannerDate }) {
  // ── Load day when planner opens or date changes ───────────────────────────
  useEffect(() => {
    if (showPlanner && store.plannerLoadDay) {
      store.plannerLoadDay(plannerDate, {
        dayStartHour: settings.plannerDayStart ?? 9,
        dayEndHour: settings.plannerDayEnd ?? 17,
      });
    }
  }, [showPlanner, plannerDate, store.plannerLoadDay, settings.plannerDayStart, settings.plannerDayEnd]);

  // Plain function (not useCallback) to always read fresh props/state
  const handlePlannerDropTask = (taskIds, startTime, currentSlots) => {
    if (!store.plannerAddTaskSlot) return;
    const dayStart = (settings.plannerDayStart ?? 9) * 60;
    const dayEnd = (settings.plannerDayEnd ?? 17) * 60;
    const step = settings.plannerSlotStep ?? 30;

    const occupied = (currentSlots || [])
      .map(s => {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        return { start: sh * 60 + sm, end: eh * 60 + em };
      })
      .sort((a, b) => a.start - b.start);

    const findFree = (startMin, dur) => {
      let c = startMin;
      let changed = true;
      while (changed) {
        changed = false;
        for (const b of occupied) {
          if (c < b.end && c + dur > b.start) {
            c = Math.ceil(b.end / step) * step;
            changed = true;
          }
        }
      }
      if (c + dur > dayEnd) {
        c = startMin;
        for (const b of occupied) {
          if (c < b.end && c + dur > b.start) {
            c = Math.floor((b.start - dur) / step) * step;
            break;
          }
        }
      }
      return Math.max(dayStart, Math.min(c, dayEnd - dur));
    };

    const [sh, sm] = startTime.split(":").map(Number);
    let nextStartMin = sh * 60 + sm;

    for (const id of taskIds) {
      const task = tasks.find(t => t.id === id);
      const durationMin = parseEstimateMinutes(task?.estimate);
      if (durationMin > dayEnd - dayStart) continue;
      const freeStart = findFree(nextStartMin, durationMin);
      const freeEnd = freeStart + durationMin;
      if (freeEnd > dayEnd) break;
      const overlaps = occupied.some(b => freeStart < b.end && freeEnd > b.start);
      if (overlaps) break;
      const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      store.plannerAddTaskSlot(id, fmt(freeStart), fmt(freeEnd), tasks);
      occupied.push({ start: freeStart, end: freeEnd });
      occupied.sort((a, b) => a.start - b.start);
      nextStartMin = freeEnd;
    }
  };

  const handlePlannerMoveSlot = useCallback((slotId, startTime, endTime) => {
    store.plannerMoveSlot?.(slotId, startTime, endTime, tasks);
  }, [store.plannerMoveSlot, tasks]);

  const handlePlannerResizeSlot = useCallback((slotId, endTime) => {
    const slotEl = document.querySelector(`[data-slot-id="${slotId}"]`);
    const startTime = slotEl?.dataset.startTime;
    const slot = (store.dayPlanSlots || []).find(s => s.id === slotId);
    if (slot?.taskId && startTime) {
      const startMin = parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1]);
      const endMin = parseInt(endTime.split(":")[0]) * 60 + parseInt(endTime.split(":")[1]);
      const durationMin = endMin - startMin;
      if (durationMin > 0) {
        const estimateStr = durationMin >= 60
          ? `${(durationMin / 60).toFixed(durationMin % 60 ? 1 : 0)} hours`
          : `${durationMin} min`;
        handleUpdate(slot.taskId, { estimate: estimateStr });
      }
    }
    store.plannerResizeSlot?.(slotId, endTime, tasks);
  }, [store.plannerResizeSlot, store.dayPlanSlots, tasks, handleUpdate]);

  const handlePlannerRemoveSlot = useCallback((slotId) => {
    store.plannerRemoveSlot?.(slotId, tasks);
  }, [store.plannerRemoveSlot, tasks]);

  const handlePlannerBlockSlot = useCallback((time) => {
    if (!store.plannerAddBlockedSlot) return;
    const startMin = timeToMinutes(time);
    const dayEnd = (settings.plannerDayEnd ?? 17) * 60;
    const slots = store.dayPlanSlots || [];
    let maxAvailable = dayEnd - startMin;
    for (const s of slots) {
      const sStart = timeToMinutes(s.startTime);
      const sEnd = timeToMinutes(s.endTime);
      if (sStart <= startMin && sEnd > startMin) { maxAvailable = 0; break; }
      if (sStart >= startMin && sStart - startMin < maxAvailable) {
        maxAvailable = sStart - startMin;
      }
    }
    const duration = Math.min(60, maxAvailable);
    if (duration <= 0) return;
    const endTime = minutesToTime(startMin + duration);
    store.plannerAddBlockedSlot(t("planner.blocked"), time, endTime);
  }, [store.plannerAddBlockedSlot, t, settings.plannerDayEnd, store.dayPlanSlots]);

  const pendingSlotTimeRef = useRef(null);

  const handlePlannerCreateTask = useCallback((time) => {
    pendingSlotTimeRef.current = time;
    document.getElementById("quick-entry")?.focus();
  }, []);

  return {
    handlePlannerDropTask, handlePlannerMoveSlot, handlePlannerResizeSlot,
    handlePlannerRemoveSlot, handlePlannerBlockSlot, handlePlannerCreateTask,
    pendingSlotTimeRef,
  };
}
