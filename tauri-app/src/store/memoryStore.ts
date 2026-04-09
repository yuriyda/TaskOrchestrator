/**
 * In-memory task store (React hook) — used for browser-only / demo mode.
 * Implements the same StoreApi contract as useTauriTaskStore but without SQLite persistence.
 */
import { useState, useReducer } from 'react';
import { STATUSES } from '../core/constants.js';
import { MOCK_LISTS, MOCK_TAGS, MOCK_FLOWS, MOCK_PERSONAS, INITIAL_TASKS, buildDemoTasks, uid } from '../core/demo.js';
import type { Task } from '../types';

function shiftDue(due: string | null): string | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const d = new Date(due + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

interface TaskAction {
  type: string
  [key: string]: any
}

export function taskReducer(state: any[], action: TaskAction): any[] {
  switch (action.type) {
    case "ADD_TASK":
      return [...state, {
        url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null,
        ...action.payload,
        id: action.payload.id || uid(), subtasks: [], createdAt: new Date().toISOString(),
      }];
    case "IMPORT_RTM":
      return [...state, ...action.tasks];
    case "UPDATE_TASK":
      return state.map(t => t.id === action.id ? { ...t, ...action.changes } : t);
    case "BULK_STATUS":
      return state.map(t => action.ids.has(t.id) ? { ...t, status: action.status } : t);
    case "BULK_CYCLE":
      return state.map(t => {
        if (!action.ids.has(t.id)) return t;
        const i = STATUSES.indexOf(t.status);
        return { ...t, status: STATUSES[(i + 1) % STATUSES.length] };
      });
    case "BULK_DELETE":
      return state.filter(t => !action.ids.has(t.id));
    case "BULK_PRIORITY":
      return state.map(t => action.ids.has(t.id) ? { ...t, priority: action.priority } : t);
    case "BULK_DUE_SHIFT":
      return state.map(t => action.ids.has(t.id) ? { ...t, due: shiftDue(t.due), postponed: (t.postponed || 0) + 1 } : t);
    case "LOAD_DEMO":
      return [...state, ...action.tasks];
    case "CLEAR_ALL":
      return [];
    case "RESTORE":
      return action.tasks;
    default:
      return state;
  }
}

// ─── Task Store (Memory Repository) ──────────────────────────────────────────
// Implements the TaskRepository interface using in-memory state (useReducer).
// To swap for a SQLite/Tauri backend, replace useTaskStore() with
// useTauriTaskStore() that exposes the same shape:
//   { tasks, lists, tags, flows,
//     addTask, bulkStatus, bulkCycle, bulkDelete, bulkPriority, bulkDueShift,
//     undo, canUndo }

export interface MemoryStoreApi {
  tasks: any[]
  lists: string[]
  tags: string[]
  flows: string[]
  personas: string[]
  addTask: (data: any, cur: any) => any
  updateTask: (id: string, changes: any, cur: any) => void
  bulkStatus: (ids: Set<string>, status: string, cur: any) => void
  bulkCycle: (ids: Set<string>, cur: any) => void
  bulkDelete: (ids: Set<string>, cur: any) => void
  bulkPriority: (ids: Set<string>, priority: number, cur: any) => void
  bulkDueShift: (ids: Set<string>, cur: any) => void
  clearAll: () => void
  loadDemoData: () => void
  importRtm: (data: any, options?: { includeCompleted?: boolean }) => Promise<{ imported: number; skipped: number }>
  undo: (onDone?: () => void) => void
  canUndo: boolean
}

export function useTaskStore(): MemoryStoreApi {
  const [tasks, dispatch] = useReducer(taskReducer, INITIAL_TASKS);
  const [history, setHistory] = useState<any[][]>([]);

  const mutate = (action: TaskAction, currentTasks: any[]): void => {
    setHistory(h => [...h.slice(-20), currentTasks]);
    dispatch(action);
  };

  return {
    // ── data ──────────────────────────────────────────────────────────────────
    tasks,
    lists:    MOCK_LISTS,
    tags:     MOCK_TAGS,
    flows:    MOCK_FLOWS,
    personas: MOCK_PERSONAS,
    // ── mutations ─────────────────────────────────────────────────────────────
    addTask:      (data: any, cur: any)                    => { const id = uid(); mutate({ type: "ADD_TASK", payload: { ...data, id } }, cur); return { ...data, id }; },
    updateTask:   (id: string, changes: any, cur: any)     => mutate({ type: "UPDATE_TASK",    id, changes }, cur),
    bulkStatus:   (ids: Set<string>, status: string, cur: any) => mutate({ type: "BULK_STATUS",    ids, status }, cur),
    bulkCycle:    (ids: Set<string>, cur: any)              => mutate({ type: "BULK_CYCLE",     ids }, cur),
    bulkDelete:   (ids: Set<string>, cur: any)              => mutate({ type: "BULK_DELETE",    ids }, cur),
    bulkPriority: (ids: Set<string>, priority: number, cur: any) => mutate({ type: "BULK_PRIORITY",  ids, priority }, cur),
    bulkDueShift: (ids: Set<string>, cur: any)              => mutate({ type: "BULK_DUE_SHIFT", ids }, cur),
    clearAll:     ()                                        => { setHistory([]); dispatch({ type: "CLEAR_ALL" }); },
    loadDemoData: ()                                        => { const { tasks } = buildDemoTasks(); dispatch({ type: "LOAD_DEMO", tasks }); },
    // ── RTM import ────────────────────────────────────────────────────────────
    importRtm: (data: any, options: { includeCompleted?: boolean } = {}) => {
      const { includeCompleted = false } = options;
      const PRIO_MAP: Record<string, number> = { P1: 1, P2: 2, P3: 3, PN: 4 };
      const listMap: Record<string, string> = {};
      for (const l of (data.lists || [])) listMap[l.id] = l.name;
      const notesBySeries: Record<string, any[]> = {};
      for (const n of (data.notes || [])) {
        if (!notesBySeries[n.series_id]) notesBySeries[n.series_id] = [];
        notesBySeries[n.series_id].push({ id: n.id, content: n.content || "", createdAt: new Date(n.date_created).toISOString() });
      }
      const rtmTasks = data.tasks || [];
      const toImport = rtmTasks.filter((t: any) => includeCompleted ? true : !(t.date_completed || t.date_trashed));
      const newTasks = toImport.map((t: any) => ({
        id: uid(),
        title:       t.name || "",
        list:        listMap[t.list_id] || null,
        tags:        Array.isArray(t.tags) ? t.tags : [],
        priority:    PRIO_MAP[t.priority] || 4,
        due:         t.date_due    ? new Date(t.date_due).toISOString().slice(0, 10)    : null,
        dateStart:   t.date_start  ? new Date(t.date_start).toISOString().slice(0, 10)  : null,
        recurrence:  t.repeat      || null,
        flowId:      null,
        dependsOn:   null,
        subtasks:    [],
        status:      t.date_completed ? "done" : t.date_trashed ? "cancelled" : "active",
        url:         t.url      || null,
        estimate:    t.estimate != null ? String(t.estimate) : null,
        postponed:   t.postponed || 0,
        rtmSeriesId: t.series_id || null,
        notes:       notesBySeries[t.series_id] || [],
        createdAt:   new Date(t.date_created).toISOString(),
      }));
      mutate({ type: "IMPORT_RTM", tasks: newTasks }, tasks);
      return Promise.resolve({ imported: newTasks.length, skipped: rtmTasks.length - toImport.length });
    },
    // ── undo ──────────────────────────────────────────────────────────────────
    undo: (onDone?: () => void) => {
      setHistory(h => {
        if (h.length === 0) return h;
        const prev = h[h.length - 1];
        dispatch({ type: "RESTORE", tasks: prev });
        if (onDone) onDone();
        return h.slice(0, -1);
      });
    },
    canUndo: history.length > 0,
  };
}
