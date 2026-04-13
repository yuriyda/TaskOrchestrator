/**
 * @file useKeyboard.ts
 * @description Custom hook for keyboard shortcuts, rubber-band drag selection,
 *   and browser context menu suppression. Attaches/detaches window-level event
 *   listeners. No state of its own.
 */
import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import type { Task, TaskId, BulkResult } from "../types";

interface UseKeyboardParams {
  store: any;
  tasks: Task[];
  displayFiltered: Task[];
  filtered: Task[];
  cursor: number;
  setCursor: (n: number) => void;
  selected: Set<TaskId>;
  setSelected: Dispatch<SetStateAction<Set<TaskId>>>;
  lastIdx: number | null;
  setLastIdx: (n: number) => void;
  blockedIds: Set<TaskId>;
  addToast: (msg: string) => void;
  showFlowToasts: (result: BulkResult | void) => void;
  t: (key: string) => string;
  locale: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchExpanded: boolean;
  setSearchExpanded: (v: boolean) => void;
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
  showSettings: false | string;
  setShowSettings: (v: false | string) => void;
  editTaskId: TaskId | null;
  setEditTaskId: (id: TaskId | null) => void;
  renamingTaskId: TaskId | null;
  setRenamingTaskId: (id: TaskId | null) => void;
  contextMenu: any;
  setContextMenu: (v: any) => void;
  confirmPending: any;
  setConfirmPending: (v: any) => void;
  clearAllFilters: () => void;
  autoSyncTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setShowPlanner: Dispatch<SetStateAction<boolean>>;
  setShowDbSwitched: (v: boolean) => void;
  dragStartRef: MutableRefObject<any>;
  didDragRef: MutableRefObject<boolean>;
  setDragRect: (v: any) => void;
}

export function useKeyboard(params: UseKeyboardParams) {
  const {
    store, tasks, displayFiltered, cursor, setCursor, selected, setSelected,
    lastIdx, setLastIdx, blockedIds, addToast, showFlowToasts, t, locale,
    searchQuery, setSearchQuery, searchExpanded, setSearchExpanded, searchInputRef,
    showSettings, setShowSettings, editTaskId, setEditTaskId,
    renamingTaskId, setRenamingTaskId,
    contextMenu, setContextMenu, confirmPending, setConfirmPending,
    clearAllFilters, autoSyncTimerRef, setShowPlanner, setShowDbSwitched,
    dragStartRef, didDragRef, setDragRect, filtered,
  } = params;

  // ── Rubber-band drag (window-level) ──────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Resolve target task IDs: explicit selection or current cursor task */
  const getTargetIds = (): Set<TaskId> =>
    selected.size > 0
      ? selected
      : displayFiltered[cursor] ? new Set([displayFiltered[cursor].id]) : new Set();

  /** Localized count message (e.g. "Done: 3 tasks") */
  const countMsg = (action: string, n: number) =>
    locale === "ru" ? `${action}: ${n} ${n === 1 ? "задача" : "задач"}` : `${action}: ${n} ${n === 1 ? "task" : "tasks"}`;

  /** Move cursor and optionally extend shift-selection */
  const moveCursor = (next: number, shift: boolean) => {
    setCursor(next);
    if (shift) {
      const anchor = lastIdx ?? cursor;
      const lo = Math.min(anchor, next), hi = Math.max(anchor, next);
      setSelected(new Set(displayFiltered.slice(lo, hi + 1).map(t => t.id)));
    } else {
      const task = displayFiltered[next];
      setSelected(task ? new Set([task.id]) : new Set());
      setLastIdx(next);
    }
  };

  // ── Keyboard handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (showSettings) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // ── Navigation ──────────────────────────────────────────────────────
      if (e.key === "Tab") {
        e.preventDefault();
        document.getElementById(e.shiftKey ? "task-list" : "search-input")?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir  = e.key === "ArrowDown" ? 1 : -1;
        moveCursor(Math.max(0, Math.min(cursor + dir, displayFiltered.length - 1)), e.shiftKey);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        moveCursor(e.key === "Home" ? 0 : displayFiltered.length - 1, e.shiftKey);
        return;
      }

      // ── Ctrl/Cmd shortcuts ──────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        const handlers: Record<string, () => void> = {
          KeyZ: () => { if (store.canUndo) { clearTimeout(autoSyncTimerRef.current!); store.undo(() => addToast(t("toast.undone"))); } },
          KeyN: () => document.getElementById("quick-entry")?.focus(),
          KeyE: () => { setSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50); },
          KeyO: async () => { const ok = await store.openNewDb?.(); if (ok) setShowDbSwitched(true); },
          KeyD: () => setShowPlanner(v => !v),
        };
        if (e.code === "KeyA" && e.shiftKey) { e.preventDefault(); setSelected(new Set(displayFiltered.map(t => t.id))); return; }
        const handler = handlers[e.code];
        if (handler && !e.shiftKey) { e.preventDefault(); handler(); }
        return;
      }

      // ── Shift+P: postpone ──────────────────────────────────────────────
      if (e.shiftKey && e.code === "KeyP") {
        e.preventDefault();
        const ids = getTargetIds();
        if (!ids.size) return;
        const shiftable = [...ids].filter(id => { const tk = tasks.find(x => x.id === id); return tk && tk.due && /^\d{4}-\d{2}-\d{2}$/.test(tk.due); });
        if (!shiftable.length) { addToast(t("toast.noNumericDue")); return; }
        store.bulkDueShift(new Set(shiftable), tasks);
        addToast(countMsg(locale === "ru" ? "Отложено" : "Postponed", shiftable.length));
        return;
      }

      // ── Bulk actions ────────────────────────────────────────────────────
      const code = e.code;
      if (e.key === "Delete") {
        e.preventDefault();
        const ids = getTargetIds();
        if (ids.size) {
          store.bulkDelete(ids, tasks); setSelected(new Set());
          addToast(countMsg(t("toast.deleted"), ids.size));
        }
      } else if (code === "Space") {
        e.preventDefault();
        const ids = getTargetIds();
        if (ids.size) {
          const pivot = displayFiltered[cursor] ?? tasks.find(t => ids.has(t.id));
          const allDone = pivot && [...ids].every(id => tasks.find(t => t.id === id)?.status === "done");
          if (!allDone && [...ids].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); }
          else {
            const newStatus = allDone ? "active" : "done";
            const result = await store.bulkStatus(ids, newStatus, tasks);
            addToast(countMsg(locale === "ru" ? (newStatus === "done" ? "Выполнено" : "Возвращено") : (newStatus === "done" ? "Done" : "Reopened"), ids.size));
            showFlowToasts(result);
          }
        }
      } else if (code === "KeyS" && !e.shiftKey) {
        e.preventDefault();
        const ids = getTargetIds();
        if (ids.size) {
          const result = await store.bulkCycle(ids, tasks);
          addToast(countMsg(locale === "ru" ? "Статус" : "Cycled", ids.size));
          showFlowToasts(result);
        }
      } else if (["Digit1","Digit2","Digit3","Digit4"].includes(code)) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const ids = getTargetIds();
          if (ids.size) store.bulkPriority(ids, parseInt(code.slice(-1)), tasks);
        }

      // ── Edit ────────────────────────────────────────────────────────────
      } else if (e.code === "KeyE" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const target = displayFiltered[cursor] ?? (selected.size === 1 ? tasks.find(x => selected.has(x.id)) : null);
        if (target) setEditTaskId(target.id);

      // ── Inline rename (F2) ────────────────────────────────────────────
      } else if (e.key === "F2") {
        e.preventDefault();
        const target = displayFiltered[cursor] ?? (selected.size === 1 ? tasks.find(x => selected.has(x.id)) : null);
        if (target) setRenamingTaskId(target.id);

      // ── Escape: cascading dismiss ───────────────────────────────────────
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
  }, [filtered, cursor, selected, lastIdx, store.canUndo, tasks, searchQuery, locale, editTaskId, renamingTaskId, contextMenu, showSettings]);

  // ── Suppress browser context menu everywhere ──────────────────────────────
  useEffect(() => {
    const suppress = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", suppress);
    return () => window.removeEventListener("contextmenu", suppress);
  }, []);
}
