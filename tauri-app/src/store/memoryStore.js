/**
 * In-memory task store (React hook) — used for browser-only / demo mode.
 * Implements the same StoreApi contract as useTauriTaskStore but without SQLite persistence.
 */
import { useState, useReducer } from 'react';
import { STATUSES } from '../core/constants.js';
import { MOCK_LISTS, MOCK_TAGS, MOCK_FLOWS, MOCK_PERSONAS, INITIAL_TASKS, buildDemoTasks, uid } from '../core/demo.js';

function shiftDue(due) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const d = new Date(due + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function taskReducer(state, action) {
  switch (action.type) {
    case "ADD_TASK":
      return [...state, {
        url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null,
        ...action.payload,
        id: uid(), subtasks: [], createdAt: new Date().toISOString(),
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

export function useTaskStore() {
  const [tasks, dispatch] = useReducer(taskReducer, INITIAL_TASKS);
  const [history, setHistory] = useState([]);

  const mutate = (action, currentTasks) => {
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
    addTask:      (data, cur)          => mutate({ type: "ADD_TASK",       payload: data }, cur),
    updateTask:   (id, changes, cur)   => mutate({ type: "UPDATE_TASK",    id, changes }, cur),
    bulkStatus:   (ids, status, cur)   => mutate({ type: "BULK_STATUS",    ids, status }, cur),
    bulkCycle:    (ids, cur)           => mutate({ type: "BULK_CYCLE",     ids }, cur),
    bulkDelete:   (ids, cur)           => mutate({ type: "BULK_DELETE",    ids }, cur),
    bulkPriority: (ids, priority, cur) => mutate({ type: "BULK_PRIORITY",  ids, priority }, cur),
    bulkDueShift: (ids, cur)           => mutate({ type: "BULK_DUE_SHIFT", ids }, cur),
    clearAll:     ()                   => { setHistory([]); dispatch({ type: "CLEAR_ALL" }); },
    loadDemoData: ()                   => { const { tasks } = buildDemoTasks(); dispatch({ type: "LOAD_DEMO", tasks }); },
    // ── RTM import ────────────────────────────────────────────────────────────
    importRtm: (data, options = {}) => {
      const { includeCompleted = false } = options;
      const PRIO_MAP = { P1: 1, P2: 2, P3: 3, PN: 4 };
      const listMap = {};
      for (const l of (data.lists || [])) listMap[l.id] = l.name;
      const notesBySeries = {};
      for (const n of (data.notes || [])) {
        if (!notesBySeries[n.series_id]) notesBySeries[n.series_id] = [];
        notesBySeries[n.series_id].push({ id: n.id, content: n.content || "", createdAt: new Date(n.date_created).toISOString() });
      }
      const rtmTasks = data.tasks || [];
      const toImport = rtmTasks.filter(t => includeCompleted ? true : !(t.date_completed || t.date_trashed));
      const newTasks = toImport.map(t => ({
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
    undo: (onDone) => {
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
