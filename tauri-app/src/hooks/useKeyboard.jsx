/**
 * @file useKeyboard.jsx
 * @description Custom hook for keyboard shortcuts, rubber-band drag selection,
 *   and browser context menu suppression. Extracted from task-orchestrator.jsx.
 *   This hook attaches/detaches window-level event listeners. No state of its own.
 */
import { useEffect } from "react";

export function useKeyboard({
  store, tasks, displayFiltered, cursor, setCursor, selected, setSelected,
  lastIdx, setLastIdx, blockedIds, addToast, showFlowToasts, t, locale,
  searchQuery, setSearchQuery, searchExpanded, setSearchExpanded, searchInputRef,
  showSettings, setShowSettings, editTaskId, setEditTaskId,
  contextMenu, setContextMenu, confirmPending, setConfirmPending,
  clearAllFilters, autoSyncTimerRef, setShowPlanner, setShowDbSwitched,
  dragStartRef, didDragRef, setDragRect, filtered,
}) {
  // ── Rubber-band drag (window-level) ──────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragStartRef.current) return;
      const { x, y, bounds } = dragStartRef.current;
      const dx = e.clientX - x, dy = e.clientY - y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      didDragRef.current = true;
      const x2 = Math.max(bounds.left, Math.min(bounds.right,  e.clientX));
      const y2 = Math.max(bounds.top,  Math.min(bounds.bottom, e.clientY));
      const rect = { x1: x, y1: y, x2, y2 };
      setDragRect(rect);
      const minX = Math.min(rect.x1, rect.x2), maxX = Math.max(rect.x1, rect.x2);
      const minY = Math.min(rect.y1, rect.y2), maxY = Math.max(rect.y1, rect.y2);
      const next = new Set();
      document.querySelectorAll("[data-task-id]").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right >= minX && r.left <= maxX && r.bottom >= minY && r.top <= maxY) {
          next.add(el.dataset.taskId);
        }
      });
      setSelected(next);
    };
    const onMouseUp = () => {
      const wasDragging = !!dragStartRef.current && didDragRef.current;
      dragStartRef.current = null;
      setDragRect(null);
      if (wasDragging) {
        document.getElementById("task-list")?.focus();
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = async (e) => {
      if (showSettings) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Tab") {
        e.preventDefault();
        document.getElementById(e.shiftKey ? "task-list" : "search-input")?.focus();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.code === "KeyZ") {
          e.preventDefault();
          if (store.canUndo) {
            clearTimeout(autoSyncTimerRef.current);
            store.undo(() => addToast(t("toast.undone")));
          }
          return;
        }
        if (e.code === "KeyA" && e.shiftKey) {
          e.preventDefault();
          setSelected(new Set(displayFiltered.map(t => t.id)));
          return;
        }
        if (e.code === "KeyN" && !e.shiftKey) {
          e.preventDefault();
          document.getElementById("quick-entry")?.focus();
          return;
        }
        if (e.code === "KeyE" && !e.shiftKey) {
          e.preventDefault();
          setSearchExpanded(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          return;
        }
        if (e.code === "KeyO" && !e.shiftKey) {
          e.preventDefault();
          store.openNewDb?.().then(ok => { if (ok) setShowDbSwitched(true); });
          return;
        }
        if (e.code === "KeyD" && !e.shiftKey) {
          e.preventDefault();
          setShowPlanner(v => !v);
          return;
        }
        return;
      }

      if (e.shiftKey && e.code === "KeyP") {
        e.preventDefault();
        const ids = selected.size > 0 ? selected : (displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set());
        if (!ids.size) return;
        const shiftable = [...ids].filter(id => { const t = tasks.find(x => x.id === id); return t && t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due); });
        if (!shiftable.length) { addToast(t("toast.noNumericDue")); return; }
        store.bulkDueShift(new Set(shiftable), tasks);
        const n = shiftable.length;
        addToast(locale === "ru"
          ? `Отложено: ${n} ${n === 1 ? "задача" : "задач"}`
          : `Postponed: ${n} ${n === 1 ? "task" : "tasks"}`);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir  = e.key === "ArrowDown" ? 1 : -1;
        const next = Math.max(0, Math.min(cursor + dir, displayFiltered.length - 1));
        setCursor(next);
        if (e.shiftKey) {
          const anchor = lastIdx ?? cursor;
          const lo = Math.min(anchor, next), hi = Math.max(anchor, next);
          setSelected(new Set(displayFiltered.slice(lo, hi + 1).map(t => t.id)));
        } else {
          const task = displayFiltered[next];
          setSelected(task ? new Set([task.id]) : new Set());
          setLastIdx(next);
        }
        return;
      }

      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const next = e.key === "Home" ? 0 : displayFiltered.length - 1;
        setCursor(next);
        if (e.shiftKey) {
          const anchor = lastIdx ?? cursor;
          const lo = Math.min(anchor, next), hi = Math.max(anchor, next);
          setSelected(new Set(displayFiltered.slice(lo, hi + 1).map(t => t.id)));
        } else {
          const task = displayFiltered[next];
          setSelected(task ? new Set([task.id]) : new Set());
          setLastIdx(next);
        }
        return;
      }

      const code = e.code;
      if (e.key === "Delete") {
        e.preventDefault();
        const ids = selected.size > 0 ? selected : (displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set());
        if (ids.size) {
          const n = ids.size;
          store.bulkDelete(ids, tasks); setSelected(new Set());
          addToast(locale === "ru"
            ? `${t("toast.deleted")}: ${n} ${n === 1 ? "задача" : "задач"}`
            : `${t("toast.deleted")}: ${n} ${n === 1 ? "task" : "tasks"}`);
        }
      } else if (code === "Space") {
        e.preventDefault();
        const ids = selected.size > 0 ? selected : (displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set());
        if (ids.size) {
          const pivot = displayFiltered[cursor] ?? tasks.find(t => ids.has(t.id));
          const allDone = pivot && [...ids].every(id => tasks.find(t => t.id === id)?.status === "done");
          if (!allDone && [...ids].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); }
          else {
            const newStatus = allDone ? "active" : "done";
            const result = await store.bulkStatus(ids, newStatus, tasks);
            const n = ids.size;
            if (newStatus === "done") {
              addToast(locale === "ru"
                ? `Выполнено: ${n} ${n === 1 ? "задача" : "задач"}`
                : `Done: ${n} ${n === 1 ? "task" : "tasks"}`);
            } else {
              addToast(locale === "ru"
                ? `Возвращено: ${n} ${n === 1 ? "задача" : "задач"}`
                : `Reopened: ${n} ${n === 1 ? "task" : "tasks"}`);
            }
            showFlowToasts(result);
          }
        }
      } else if (code === "KeyS" && !e.shiftKey) {
        e.preventDefault();
        const ids = selected.size > 0 ? selected : (displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set());
        if (ids.size) {
          const n = ids.size;
          const result = await store.bulkCycle(ids, tasks);
          addToast(locale === "ru"
            ? `Статус: ${n} ${n === 1 ? "задача" : "задач"}`
            : `Cycled: ${n} ${n === 1 ? "task" : "tasks"}`);
          showFlowToasts(result);
        }
      } else if (["Digit1","Digit2","Digit3","Digit4"].includes(code)) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const priority = parseInt(code.slice(-1));
          const ids = selected.size > 0 ? selected : (displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set());
          if (ids.size) store.bulkPriority(ids, priority, tasks);
        }
      } else if (e.code === "KeyE" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const target = displayFiltered[cursor] ?? (selected.size === 1 ? tasks.find(x => selected.has(x.id)) : null);
        if (target) setEditTaskId(target.id);
      } else if (e.key === "Escape") {
        if (confirmPending)    { setConfirmPending(null); return; }
        if (showSettings)      { setShowSettings(false); return; }
        if (contextMenu)       { setContextMenu(null); return; }
        if (editTaskId)        { setEditTaskId(null); return; }
        if (selected.size > 0) setSelected(new Set());
        else if (searchQuery)  setSearchQuery("");
        else                   clearAllFilters();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [filtered, cursor, selected, lastIdx, store.canUndo, tasks, searchQuery, locale, editTaskId, contextMenu, showSettings]);

  // ── Suppress browser context menu everywhere ──────────────────────────────
  useEffect(() => {
    const suppress = (e) => e.preventDefault();
    window.addEventListener("contextmenu", suppress);
    return () => window.removeEventListener("contextmenu", suppress);
  }, []);
}
