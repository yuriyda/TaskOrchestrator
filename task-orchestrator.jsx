/**
 * TaskOrchestrator — main UI component tree for the task management app.
 * Contains all React components: sidebar, task list, detail panel, dialogs, calendar, etc.
 * Domain logic, constants, parsers, and store are imported from tauri-app/src/ modules.
 */
import { useState, useReducer, useRef, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { Search, Plus, Check, CheckCircle2, X, Inbox, List, ArrowRight, CornerDownRight, Repeat, Flag, Calendar, Hash, Filter, Keyboard, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, Settings, Sun, Moon, Monitor, FileText, Link, Clock, Upload, User, Download, Trash2, AlertTriangle, Info, Globe, AlignJustify, HardDrive, FolderOpen, Copy, Lock, Play, Palette, Edit3, ExternalLink } from "lucide-react";
import { ulid } from "./tauri-app/src/ulid.js";
import { LOCALES, LOCALE_NAMES } from "./tauri-app/src/i18n/locales.js";
import { STATUSES, STATUS_ICONS, PRIORITY_COLORS, STATUS_ORDER, SORT_FIELDS, FONTS, DATE_FORMATS, CSV_FIELDS } from "./tauri-app/src/core/constants.js";
import { COLOR_THEMES, buildTC } from "./tauri-app/src/core/themes.js";
import { swapLayout } from "./tauri-app/src/core/layout.js";
import { localIsoDate, parseDateInput, fmtDate } from "./tauri-app/src/core/date.js";
import { OVERDUE_DATE_CLS, OVERDUE_STRIPE, OVERDUE_BG, overdueLevel } from "./tauri-app/src/core/overdue.js";
import { ruPlural, humanRecurrence } from "./tauri-app/src/core/recurrence.js";
import { CHIP_STYLE, parseShorthand, getSuggestions, getTokenType, tryCommitToken, buildFromChips } from "./tauri-app/src/parse/quickEntry.js";
import { MOCK_LISTS, MOCK_TAGS, MOCK_FLOWS, MOCK_PERSONAS, INITIAL_TASKS, buildDemoTasks } from "./tauri-app/src/core/demo.js";
import { useTaskStore } from "./tauri-app/src/store/memoryStore.js";
export { useTaskStore };

import { AppContext, useApp } from "./tauri-app/src/ui/AppContext.jsx";
import { PanelLeftIcon, PanelRightIcon, AutoThemeIcon, themeOptions } from "./tauri-app/src/ui/icons.jsx";
import { PriorityBadge, StatusBadge } from "./tauri-app/src/ui/badges.jsx";
import { TokenChip, ChipPill, SectionDivider, ConfirmDialog, BulkBar, ToastContainer } from "./tauri-app/src/ui/common.jsx";
import { ContextMenu } from "./tauri-app/src/ui/ContextMenu.jsx";
import { QuickEntry } from "./tauri-app/src/ui/QuickEntry.jsx";
import { TaskRow } from "./tauri-app/src/ui/TaskRow.jsx";
import { Combobox } from "./tauri-app/src/ui/Combobox.jsx";
import { SettingsDialog } from "./tauri-app/src/ui/SettingsDialog.jsx";
import { Sidebar } from "./tauri-app/src/ui/Sidebar.jsx";
import { FlowView } from "./tauri-app/src/ui/FlowView.jsx";
import { CalendarPanel } from "./tauri-app/src/ui/CalendarPanel.jsx";
import { DatePicker, DatePickerAnchor, DateField } from "./tauri-app/src/ui/DatePicker.jsx";
import { DetailPanel } from "./tauri-app/src/ui/DetailPanel.jsx";
import { TaskEditDialog } from "./tauri-app/src/ui/TaskEditDialog.jsx";
import { RtmImportDialog, ImportProgressOverlay } from "./tauri-app/src/ui/RtmImportDialog.jsx";
import { SortBar } from "./tauri-app/src/ui/SortBar.jsx";
import { StatusBar } from "./tauri-app/src/ui/StatusBar.jsx";
import { GUIDE_STEPS, GuideOverlay } from "./tauri-app/src/ui/GuideOverlay.jsx";
import { DayPlanner } from "./tauri-app/src/ui/DayPlanner.jsx";
import { defaultEndTime, timeToMinutes, minutesToTime } from "./tauri-app/src/store/dayPlanner.js";

// ─── App ──────────────────────────────────────────────────────────────────────

export default function TaskOrchestrator({ storeHook = useTaskStore } = {}) {
  // saveMetaRef is populated after the store is initialised (below) so that
  // updateSetting / locale / theme effects can call it without moving the
  // storeHook() call (which would change hook order across renders).
  const saveMetaRef = useRef(null);

  // ── UI Guide state ──────────────────────────────────────────────────────
  const [guideStep, setGuideStep] = useState(-1); // -1 = hidden

  // ── i18n / theme state ────────────────────────────────────────────────────
  const [locale, setLocale] = useState(() => {
    try { return localStorage.getItem("to_locale") || "en"; } catch { return "en"; }
  });
  const [theme, setTheme]   = useState(() => {
    try { return localStorage.getItem("to_theme") || "auto"; } catch { return "auto"; }
  });

  // ── Settings state ────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false); // false | "general" | "about" | etc.
  const [gdriveLog, setGdriveLog] = useState([]);
  const [settings, setSettingsState] = useState(() => {
    try {
      const saved = localStorage.getItem("to_settings");
      const def = { firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal", condense: false, colorTheme: "default", clockFormat: "24h", newTaskActiveToday: false, autoSync: true, autoExtractUrl: true };
      return saved ? { ...def, ...JSON.parse(saved) } : def;
    } catch { return { firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal", condense: false, colorTheme: "default", clockFormat: "24h", newTaskActiveToday: false, autoSync: true, autoExtractUrl: true }; }
  });

  const updateSetting = (key, val) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem("to_settings", JSON.stringify(next)); } catch {}
      saveMetaRef.current?.("to_settings", JSON.stringify(next));
      return next;
    });
  };

  // Persist locale and theme changes
  useEffect(() => {
    try { localStorage.setItem("to_locale", locale); } catch {}
    saveMetaRef.current?.("to_locale", locale);
  }, [locale]);
  useEffect(() => {
    try { localStorage.setItem("to_theme", theme); } catch {}
    saveMetaRef.current?.("to_theme", theme);
  }, [theme]);

  const [resolvedTheme, setResolvedTheme] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  useEffect(() => {
    if (theme !== "auto") { setResolvedTheme(theme); return; }
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => setResolvedTheme(e.matches ? "dark" : "light");
    setResolvedTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // ── Theme class map ───────────────────────────────────────────────────────
  const TC = buildTC(resolvedTheme, settings.colorTheme);

  // ── Translation helper ────────────────────────────────────────────────────
  const t = (key, params = {}) => {
    let s = (LOCALES[locale] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  // ── Task state ────────────────────────────────────────────────────────────
  const store = storeHook();
  const { tasks } = store;

  // ── Google Drive connection state ────────────────────────────────────────
  const [gdriveConnected, setGdriveConnected] = useState(false);
  useEffect(() => {
    store.gdriveCheckConnection?.().then(ok => setGdriveConnected(!!ok));
  }, [store, store.metaSettings]);

  // ── Google Drive sync with logging ───────────────────────────────────────
  const addGdriveLog = (msg) => {
    const ts = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setGdriveLog(prev => [...prev, `[${ts}] ${msg}`]);
  };
  const handleSyncNow = store.gdriveSyncNow ? async () => {
    addGdriveLog(t("sync.gdriveSyncing"));
    const result = await store.gdriveSyncNow();
    if (result) {
      addGdriveLog(
        t("sync.gdriveSynced")
          .replace("{applied}", result.applied)
          .replace("{outdated}", result.outdated)
          .replace("{uploaded}", result.uploaded)
      );
    }
    return result;
  } : undefined;

  // ── Auto-sync after task edits (debounced) ─────────────────────────────
  const autoSyncTimerRef = useRef(null);
  const syncInProgressRef = useRef(false); // true during any sync (manual or auto)
  const [autoSyncing, setAutoSyncing] = useState(false);

  const wrappedSyncNow = useCallback(async () => {
    if (!handleSyncNow) return;
    syncInProgressRef.current = true;
    try { return await handleSyncNow(); }
    finally { syncInProgressRef.current = false; }
  }, [handleSyncNow]);

  const triggerAutoSync = useCallback(() => {
    if (!handleSyncNow || settings.autoSync === false) return;
    if (!gdriveConnected) return;
    if (syncInProgressRef.current) return;
    clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(async () => {
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      setAutoSyncing(true);
      try { await handleSyncNow(); } catch {}
      syncInProgressRef.current = false;
      setAutoSyncing(false);
    }, 3000);
  }, [handleSyncNow, settings.autoSync, gdriveConnected]);

  // Trigger auto-sync whenever tasks change (debounced), skip if sync caused the change
  const prevTasksRef = useRef(tasks);
  useEffect(() => {
    if (prevTasksRef.current !== tasks && prevTasksRef.current.length > 0 && !syncInProgressRef.current) {
      triggerAutoSync();
    }
    prevTasksRef.current = tasks;
  }, [tasks, triggerAutoSync]);

  // Wire the saveMeta ref so updateSetting / locale / theme effects can use it
  saveMetaRef.current = store.saveMeta ?? null;

  // Apply settings loaded from SQLite (runs once when metaSettings arrives)
  const metaApplied = useRef(false);
  useEffect(() => {
    if (!store.metaSettings || metaApplied.current) return;
    metaApplied.current = true;
    const m = store.metaSettings;
    if (m["to_locale"]) setLocale(m["to_locale"]);
    if (m["to_theme"])  setTheme(m["to_theme"]);
    if (m["to_settings"]) {
      try {
        const loaded = JSON.parse(m["to_settings"]);
        const def = { firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal", condense: false, colorTheme: "default", clockFormat: "24h", newTaskActiveToday: false };
        setSettingsState({ ...def, ...loaded });
      } catch {}
    }
    if (m["to_guide_completed"] !== "true") {
      setGuideStep(0);
    }
  }, [store.metaSettings]);

  const [cursor, setCursor]   = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [lastIdx, setLastIdx]   = useState(null);
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem("statusFilter");
    const status = saved === "active" ? "active" : saved === "done" ? "done" : null;
    return { status, dateRange: null, list: null, tag: null, flow: null, persona: null };
  });
  const setFilter = (key, value) => {
    const newValue = filters[key] === value ? null : value;
    setFilters(f => ({ ...f, [key]: newValue }));
    if (key === "dateRange") setCalendarFilter(null);
    if (key === "status") localStorage.setItem("statusFilter", newValue || "");
  };
  const setFilterForce = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    if (key === "dateRange") setCalendarFilter(null);
    if (key === "status") localStorage.setItem("statusFilter", value || "");
  };
  const clearFilter = (key) => { setFilters(f => ({ ...f, [key]: null })); if (key === "status") localStorage.setItem("statusFilter", ""); };
  const clearAllFilters = () => { setFilters({ status: null, dateRange: null, list: null, tag: null, flow: null, persona: null }); localStorage.setItem("statusFilter", ""); };
  // Backward-compat helpers
  const hasAnyFilter = Object.values(filters).some(v => v !== null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [showSidebar, setShowSidebar]       = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showCalendar, setShowCalendar]     = useState(true);
  const [showPlanner, setShowPlanner]       = useState(false);
  const [plannerDate, setPlannerDate]       = useState(() => new Date().toISOString().slice(0, 10));
  const [plannerWidthPct, setPlannerWidthPct] = useState(40);
  const plannerDividerRef = useRef(null);
  const [calendarFilter, setCalendarFilterRaw] = useState(null);
  const setCalendarFilter = (v) => {
    setCalendarFilterRaw(v);
    if (v) setFilters(f => ({ ...f, dateRange: null }));
  };
  const [confirmPending, setConfirmPending] = useState(null);
  const [rtmImportData,  setRtmImportData]  = useState(null);
  const [importProgress, setImportProgress] = useState(null); // null | { current, total }
  const [editTaskId,       setEditTaskId]       = useState(null);
  const [contextMenu,      setContextMenu]      = useState(null); // null | { x, y, task }
  const [showDemoConfirm,  setShowDemoConfirm]  = useState(false);
  const [showDbSwitched,   setShowDbSwitched]   = useState(false);
  const rtmFileRef = useRef(null);
  const [sort, setSort] = useState(null);
  // ── Rubber-band selection ─────────────────────────────────────────────────
  const [dragRect, setDragRect] = useState(null); // {x1,y1,x2,y2} in clientX/Y
  const dragStartRef = useRef(null);              // {x,y} at mousedown
  const didDragRef   = useRef(false);             // true if actual movement happened

  const toggleSort = (field) => {
    setSort(s => {
      if (s === null || s.field !== field) return { field, dir: "asc" };
      if (s.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  };

  const [lastAction, setLastAction] = useState("");
  const addToast = (msg) => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg }]);
    setLastAction(msg);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 3000);
  };

  // Show toasts for flow auto-activation / blocked-skip results
  const showFlowToasts = (result) => {
    if (!result) return;
    const { activated, skippedBlocked } = result;
    if (activated && activated.length > 0) addToast(t("flow.activated").replace("{names}", activated.join(", ")));
    if (skippedBlocked > 0) addToast(t("flow.skippedBlocked").replace("{n}", skippedBlocked));
  };

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = tasks;
    // Status filter
    if (filters.status) r = r.filter(tk => tk.status === filters.status);
    // Date range filter
    if (filters.dateRange) {
      const todayStr = localIsoDate(new Date());
      const isPastDue = tt => tt.due && tt.due < todayStr && tt.status !== "done" && tt.status !== "cancelled";
      const v = filters.dateRange;
      if (v === "overdue") r = r.filter(isPastDue);
      else if (v === "today") r = r.filter(tt => tt.due === todayStr || isPastDue(tt));
      else if (v === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); const tom = localIsoDate(d); r = r.filter(tt => tt.due === tom || isPastDue(tt)); }
      else if (v === "week") { const d = new Date(); d.setDate(d.getDate() + 7); const max = localIsoDate(d); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
      else if (v === "month") { const d = new Date(); d.setDate(d.getDate() + 30); const max = localIsoDate(d); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
    }
    // List filter
    if (filters.list) r = r.filter(tk => tk.list === filters.list);
    // Tag filter
    if (filters.tag) r = r.filter(tk => tk.tags.includes(filters.tag));
    // Flow filter
    if (filters.flow) r = r.filter(tk => tk.flowId === filters.flow);
    // Persona filter
    if (filters.persona) r = r.filter(tk => (tk.personas || []).includes(filters.persona));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const altQ = swapLayout(q);
      const match = (str) => { const s = str.toLowerCase(); return s.includes(q) || (altQ !== q && s.includes(altQ)); };
      r = r.filter(t =>
        match(t.title) ||
        t.tags.some(tag => match(tag)) ||
        (t.list && match(t.list))
      );
    }
    if (calendarFilter) r = r.filter(t => t.due === calendarFilter);

    // Primary sort by selected field (if any), secondary always by title
    const field = sort?.field ?? null;
    const mul = sort ? (sort.dir === "asc" ? 1 : -1) : 1;
    r = [...r].sort((a, b) => {
      if (field === "priority") {
        const va = a.priority ?? 99, vb = b.priority ?? 99;
        if (va !== vb) return (va - vb) * mul;
      } else if (field === "status") {
        const va = STATUS_ORDER[a.status] ?? 99, vb = STATUS_ORDER[b.status] ?? 99;
        if (va !== vb) return (va - vb) * mul;
      } else if (field === "due") {
        if (!a.due && !b.due) { /* fall through to title */ }
        else if (!a.due) return 1;
        else if (!b.due) return -1;
        else if (a.due !== b.due) return (a.due < b.due ? -1 : 1) * mul;
      } else if (field === "createdAt") {
        if (a.createdAt !== b.createdAt) return (a.createdAt < b.createdAt ? -1 : 1) * mul;
      }
      // Secondary: always by title
      return a.title.localeCompare(b.title, locale);
    });

    return r;
  }, [tasks, filters, searchQuery, calendarFilter, sort, locale]);

  // Overdue tasks float to the top of the list
  const displayFiltered = useMemo(() => {
    const isOverdue = t => overdueLevel(t) !== null;
    const over = filtered.filter(isOverdue);
    if (over.length === 0) return filtered;
    return [...over, ...filtered.filter(t => !isOverdue(t))];
  }, [filtered]);

  const overdueCount = useMemo(
    () => displayFiltered.filter(t => overdueLevel(t) !== null).length,
    [displayFiltered]
  );

  // Compute set of blocked task IDs (dependsOn points to an incomplete task)
  const blockedIds = useMemo(() => {
    const doneSet = new Set(tasks.filter(t => t.status === "done").map(t => t.id));
    const blocked = new Set();
    for (const t of tasks) {
      if (t.dependsOn && !doneSet.has(t.dependsOn)) blocked.add(t.id);
    }
    return blocked;
  }, [tasks]);

  useEffect(() => {
    if (displayFiltered.length > 0 && cursor >= displayFiltered.length) setCursor(displayFiltered.length - 1);
    // Remove selected IDs that are no longer in the visible list
    const visibleIds = new Set(displayFiltered.map(t => t.id));
    setSelected(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayFiltered]);

  // ── Day Planner integration ────────────────────────────────────────────
  useEffect(() => {
    if (showPlanner && store.plannerLoadDay) {
      store.plannerLoadDay(plannerDate, {
        dayStartHour: settings.plannerDayStart ?? 9,
        dayEndHour: settings.plannerDayEnd ?? 17,
      });
    }
  }, [showPlanner, plannerDate, store.plannerLoadDay, settings.plannerDayStart, settings.plannerDayEnd]);

  const parseEstimateMinutes = (estimate) => {
    if (!estimate) return 60;
    const est = estimate.toLowerCase();
    const hMatch = est.match(/([\d.]+)\s*h/);
    const mMatch = est.match(/([\d.]+)\s*m/);
    let min = 60;
    if (hMatch) min = Math.round(parseFloat(hMatch[1]) * 60);
    else if (mMatch) min = Math.round(parseFloat(mMatch[1]));
    return Math.max(15, min);
  };

  // Plain function (not useCallback) to always read fresh props/state
  const handlePlannerDropTask = (taskIds, startTime, currentSlots) => {
    if (!store.plannerAddTaskSlot) return;
    const dayStart = (settings.plannerDayStart ?? 9) * 60;
    const dayEnd = (settings.plannerDayEnd ?? 17) * 60;
    const step = settings.plannerSlotStep ?? 30;

    // Build occupied ranges from slots passed by DayPlanner (guaranteed fresh)
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
      // If doesn't fit after last occupied slot, try before first collision
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
      // Task too long for the entire day
      if (durationMin > dayEnd - dayStart) continue;
      const freeStart = findFree(nextStartMin, durationMin);
      const freeEnd = freeStart + durationMin;
      // No space found
      if (freeEnd > dayEnd) break;
      // Verify no overlap (final safety check)
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
    // Read slot from DOM data attribute (always fresh, set during resize preview)
    const slotEl = document.querySelector(`[data-slot-id="${slotId}"]`);
    const startTime = slotEl?.dataset.startTime;
    // Find taskId from current state
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
  }, [store.plannerResizeSlot, store.dayPlanSlots, tasks]);

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

  // ── Rubber-band drag (window-level) ──────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragStartRef.current) return;
      const { x, y, bounds } = dragStartRef.current;
      const dx = e.clientX - x, dy = e.clientY - y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; // dead-zone
      didDragRef.current = true;
      // Clamp current mouse position to the main container bounds
      const x2 = Math.max(bounds.left, Math.min(bounds.right,  e.clientX));
      const y2 = Math.max(bounds.top,  Math.min(bounds.bottom, e.clientY));
      const rect = { x1: x, y1: y, x2, y2 };
      setDragRect(rect);

      // Compute intersecting task rows
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
      // Only focus task-list sentinel when an actual drag just ended
      // (prevents stealing focus from Settings and other dialogs)
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

  // ── Context menu handlers ─────────────────────────────────────────────────
  const handleContextMenu = (e, task) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  };

  const handleCtxOpen = (taskId) => {
    setContextMenu(null);
    handleEditFull(taskId);
  };

  const handleCtxAssignToday = (ids) => {
    setContextMenu(null);
    store.bulkAssignToday(ids, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `На сегодня: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Assigned today: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const handleCtxSnooze = (ids, days, months) => {
    setContextMenu(null);
    store.bulkSnooze(ids, days, months, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `Отложено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Snoozed: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const handleCtxMarkDone = async (ids) => {
    setContextMenu(null);
    if ([...ids].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); return; }
    const result = await store.bulkStatus(ids, "done", tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `Выполнено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Done: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };

  const handleCtxSetStatus = async (ids, status) => {
    setContextMenu(null);
    const result = await store.bulkStatus(ids, status, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `${t("status." + status)}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("status." + status)}: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };

  const handleCtxDuplicate = (taskId) => {
    setContextMenu(null);
    const src = tasks.find(t => t.id === taskId);
    if (!src) return;
    const { id: _id, createdAt: _ca, rtmSeriesId: _rs, ...rest } = src;
    store.addTask({ ...rest, notes: [] }, tasks);
    addToast(locale === "ru" ? "Задача продублирована" : "Task duplicated");
  };

  const handleCtxDelete = (ids) => {
    setContextMenu(null);
    const n = ids.size;
    store.bulkDelete(ids, tasks);
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    addToast(locale === "ru"
      ? `${t("toast.deleted")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("toast.deleted")}: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  // ── Flow handlers ────────────────────────────────────────────────────────
  const handleFlowStartNext = async (taskId) => {
    const result = await store.bulkStatus(new Set([taskId]), "active", tasks);
    addToast(locale === "ru" ? "Задача запущена" : "Task started");
    showFlowToasts(result);
  };

  const handleFlowUpdate = (name, changes) => {
    store.updateFlow(name, changes);
  };

  const handleFlowDelete = (name) => {
    store.deleteFlow(name);
    clearFilter("flow");
  };

  // ── Row click ─────────────────────────────────────────────────────────────
  const handleRowClick = (e, taskId, idx) => {
    setCursor(idx);
    if (e.shiftKey && lastIdx !== null) {
      const lo = Math.min(lastIdx, idx), hi = Math.max(lastIdx, idx);
      setSelected(new Set(filtered.slice(lo, hi + 1).map(t => t.id)));
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => { const next = new Set(prev); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
      setLastIdx(idx);
    } else {
      setSelected(new Set([taskId]));
      setLastIdx(idx);
    }
  };

  // ── Bulk handlers ─────────────────────────────────────────────────────────
  const bulkDone   = async () => {
    if (!selected.size) return;
    if ([...selected].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); return; }
    const n = selected.size;
    const result = await store.bulkStatus(selected, "done", tasks);
    addToast(locale === "ru"
      ? `Выполнено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Done: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };
  const bulkCycle  = async () => {
    if (!selected.size) return;
    const result = await store.bulkCycle(selected, tasks);
    showFlowToasts(result);
  };
  const bulkShift  = () => {
    const shiftable = [...selected].filter(id => { const t = tasks.find(x => x.id === id); return t && t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due); });
    if (!shiftable.length) { addToast(t("toast.noNumericDue")); return; }
    store.bulkDueShift(new Set(shiftable), tasks);
    const n = shiftable.length;
    addToast(locale === "ru"
      ? `Отложено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Postponed: ${n} ${n === 1 ? "task" : "tasks"}`);
  };
  const bulkToday = () => {
    if (!selected.size) return;
    const n = selected.size;
    store.bulkAssignToday(selected, tasks);
    addToast(locale === "ru"
      ? `На сегодня: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Assigned today: ${n} ${n === 1 ? "task" : "tasks"}`);
  };
  const bulkDelete = () => {
    if (!selected.size) return;
    const n = selected.size;
    store.bulkDelete(selected, tasks); setSelected(new Set());
    addToast(locale === "ru"
      ? `${t("toast.deleted")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("toast.deleted")}: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const handleAdd = async (taskData) => {
    const data = { ...taskData };
    // Apply active filters as defaults so the new task stays in the current view
    if (!data.due && filters.dateRange) {
      const today = localIsoDate(new Date());
      if (filters.dateRange === "today" || filters.dateRange === "overdue") {
        data.due = today;
      } else if (filters.dateRange === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1);
        data.due = localIsoDate(d);
      } else if (filters.dateRange === "week") {
        const d = new Date(); d.setDate(d.getDate() + 7);
        data.due = localIsoDate(d);
      } else if (filters.dateRange === "month") {
        const d = new Date(); d.setDate(d.getDate() + 30);
        data.due = localIsoDate(d);
      }
    }
    if (filters.status === "active" && (!data.status || data.status === "inbox")) {
      data.status = "active";
    }
    if (!data.list && filters.list) {
      data.list = filters.list;
    }
    if (filters.tag && (!data.tags || !data.tags.includes(filters.tag))) {
      data.tags = [...(data.tags || []), filters.tag];
    }
    if (filters.persona && (!data.personas || !data.personas.includes(filters.persona))) {
      data.personas = [...(data.personas || []), filters.persona];
    }

    const task = await store.addTask(data, tasks);

    // If created from planner ("Create task here"), place it in the clicked slot
    if (task && pendingSlotTimeRef.current && store.plannerAddTaskSlot && store.currentPlan) {
      const time = pendingSlotTimeRef.current;
      pendingSlotTimeRef.current = null;
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
      if (duration > 0) {
        const endTime = minutesToTime(startMin + duration);
        store.plannerAddTaskSlot(task.id, time, endTime, tasks);
      }
    }
  };

  const handleUpdate = (id, rawChanges) => {
    // Inline title editing uses the synthetic key "__title__" to avoid collision;
    // normalize it back to "title" before persisting.
    const { __title__, ...rest } = rawChanges;
    const changes = __title__ !== undefined ? { ...rest, title: __title__ } : rawChanges;
    store.updateTask(id, changes, tasks).then(showFlowToasts);
  };

  const handleEditFull = (taskId) => setEditTaskId(taskId);

  const handleEditSave = (changes) => {
    if (!editTaskId) return;
    // map __title__ back to title
    const normalized = { ...changes };
    if ("__title__" in normalized) { normalized.title = normalized.__title__; delete normalized.__title__; }
    store.updateTask(editTaskId, normalized, tasks).then(showFlowToasts);
    setEditTaskId(null);
  };

  // ── RTM import ─────────────────────────────────────────────────────────────
  const handleRtmFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { setRtmImportData(JSON.parse(ev.target.result)); }
      catch { addToast(locale === "ru" ? "Ошибка: неверный JSON" : "Error: invalid JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRtmImport = async (includeCompleted) => {
    if (!rtmImportData) return;
    setRtmImportData(null);
    setImportProgress({ current: 0, total: 0 });
    const result = await store.importRtm(rtmImportData, {
      includeCompleted,
      onProgress: (current, total) => setImportProgress({ current, total }),
    });
    setImportProgress(null);
    const n = result.imported;
    addToast(locale === "ru"
      ? `${t("rtm.importedToast")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("rtm.importedToast")}: ${n} task${n !== 1 ? "s" : ""}`);
  };

  const handleCheckboxClick = (task) => {
    const ids = selected.size > 1 && selected.has(task.id) ? new Set(selected) : new Set([task.id]);
    const isDone = task.status === "done";
    // If trying to complete (not uncomplete), check for blocked tasks
    if (!isDone) {
      const allBlocked = [...ids].every(id => blockedIds.has(id));
      if (allBlocked) { addToast(t("flow.blocked")); return; }
    }
    setConfirmPending({ ids, isDone });
  };

  const handleConfirm = async () => {
    if (!confirmPending) return;
    const { ids, isDone } = confirmPending;
    const result = await store.bulkStatus(ids, isDone ? "active" : "done", tasks);
    showFlowToasts(result);
    setConfirmPending(null);
  };

  const confirmMessage = () => {
    const { ids, isDone } = confirmPending;
    const n = ids.size;
    if (locale === "ru") {
      if (isDone) return n === 1 ? "Отменить завершение задачи?" : `Отменить завершение ${n} задач?`;
      return n === 1 ? "Завершить задачу?" : `Завершить ${n} ${n >= 2 && n <= 4 ? "задачи" : "задач"}?`;
    }
    if (isDone) return n === 1 ? "Undo completion of task?" : `Undo completion of ${n} tasks?`;
    return n === 1 ? "Complete task?" : `Complete ${n} tasks?`;
  };

  const activeFlowName = filters.flow || null;

  const calendarBadgeDate = calendarFilter
    ? new Date(calendarFilter + "T12:00:00").toLocaleDateString(t("footer.dateLocale"), { day: "numeric", month: "long" })
    : null;

  // ── Context value ─────────────────────────────────────────────────────────
  const ctxValue = {
    t, locale, setLocale, theme, setTheme, resolvedTheme, TC,
    settings, updateSetting,
    // reference data from the active store (swap for Tauri store values later)
    lists:    store.lists,
    tags:     store.tags,
    flows:    store.flows,
    flowMeta: store.flowMeta || {},
    personas: store.personas || [],
    openUrl:  store.openUrl || ((url) => window.open(url, "_blank")),
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppContext.Provider value={ctxValue}>
      <div className={`h-screen flex flex-col ${TC.root}`}>
        <style>{`
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track  { background: ${TC.scrollTrack}; }
          ::-webkit-scrollbar-thumb  { background: ${TC.scrollThumb}; border-radius: 4px; }
          ::-webkit-scrollbar-thumb:hover { background: ${TC.scrollThumbHover}; }
          ${settings.fontFamily ? `body, body * { font-family: ${settings.fontFamily} !important; }` : ""}
          ${settings.fontSize === "bigger" ? "html { font-size: 18px !important; }" : settings.fontSize === "biggest" ? "html { font-size: 20px !important; }" : ""}
        `}</style>

        {/* ── Header ── */}
        <header className={`flex-shrink-0 border-b px-6 py-3 flex items-center gap-4 ${TC.header}`}>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setShowSettings("about")} title={t("settings.tab.about")} className="cursor-pointer hover:opacity-80 transition-opacity">
              <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <rect width="512" height="512" rx="96" fill="#0f172a"/>
                <circle cx="256" cy="256" r="180" fill="none" stroke="#3b82f6" strokeWidth="24" opacity="0.3"/>
                <circle cx="256" cy="256" r="140" fill="none" stroke="#3b82f6" strokeWidth="20"/>
                <polyline points="180,260 232,312 340,204" fill="none" stroke="#60a5fa" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="256" cy="76" r="12" fill="#3b82f6" opacity="0.7"/>
                <circle cx="256" cy="436" r="12" fill="#3b82f6" opacity="0.7"/>
                <circle cx="76" cy="256" r="12" fill="#3b82f6" opacity="0.7"/>
                <circle cx="436" cy="256" r="12" fill="#3b82f6" opacity="0.7"/>
              </svg>
            </button>
            <h1 className={`text-lg font-semibold tracking-tight ${TC.text}`}>Task Orchestrator</h1>
            <button
              onClick={() => setShowSidebar(v => !v)}
              title={showSidebar ? t("hdr.hideLeft") : t("hdr.showLeft")}
              className={`p-1.5 rounded-md transition-colors ${showSidebar ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <PanelLeftIcon size={18} active={showSidebar} />
            </button>
          </div>

          <div data-guide="search" className="relative flex items-center">
            <div className={`flex items-center rounded-lg border overflow-hidden transition-all duration-300 ease-in-out ${
              searchExpanded || searchQuery ? "w-[32rem] max-w-md" : "w-10"
            } ${TC.input} ${searchExpanded || searchQuery ? "border-opacity-100" : "border-opacity-40"}`}>
              <button
                onClick={() => {
                  setSearchExpanded(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className={`flex-shrink-0 p-1.5 transition-colors ${TC.textMuted} hover:text-gray-300`}
              >
                <Search size={14} />
              </button>
              <input
                ref={searchInputRef}
                id="search-input"
                autoComplete="off"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("hdr.search")}
                className={`border-none bg-transparent py-1.5 pr-8 text-sm outline-none transition-all duration-300 ${
                  searchExpanded || searchQuery ? "w-full opacity-100" : "w-0 opacity-0 p-0"
                } ${TC.inputText}`}
                onKeyDown={e => {
                  if (e.key === "Escape") { e.stopPropagation(); setSearchQuery(""); setSearchExpanded(false); e.target.blur(); return; }
                  if (e.key !== "Tab") return;
                  e.preventDefault();
                  document.getElementById(e.shiftKey ? "task-list" : "quick-entry")?.focus();
                }}
                onBlur={() => { if (!searchQuery) setSearchExpanded(false); }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchExpanded(false); searchInputRef.current?.blur(); }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 ${TC.textMuted} hover:text-gray-300`}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className={`text-xs whitespace-nowrap flex items-center gap-1 ${TC.textMuted}`}>
            {filtered.length !== tasks.length && <span className="mr-1 text-sky-400">{filtered.length} {t("hdr.found")} ·</span>}
            <button
              onClick={() => { clearAllFilters(); setCalendarFilter(null); setSearchQuery(""); }}
              className="hover:text-sky-400 transition-colors">
              {tasks.length} {t("hdr.tasks")}
            </button>
            <span>·</span>
            <button
              onClick={() => setFilterForce("status", "done")}
              className="hover:text-sky-400 transition-colors">
              {tasks.filter(t => t.status === "done").length} {t("hdr.completed")}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowPlanner(v => !v)}
              title={`${t("planner.title")} (Ctrl+D)`}
              className={`p-1.5 rounded-md transition-colors ${showPlanner ? "text-amber-400 bg-amber-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <Clock size={18} />
            </button>

            <button
              onClick={() => {
                if (!showRightPanel) { setShowRightPanel(true); setShowCalendar(true); }
                else                 { setShowCalendar(v => !v); }
              }}
              title={showCalendar && showRightPanel ? t("hdr.hideCal") : t("hdr.showCal")}
              className={`p-1.5 rounded-md transition-colors ${showCalendar && showRightPanel ? "text-violet-400 bg-violet-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <Calendar size={18} />
            </button>

            <button
              onClick={() => updateSetting("condense", !settings.condense)}
              title={settings.condense ? t("hdr.expand") : t("hdr.condense")}
              className={`p-1.5 rounded-md transition-colors ${settings.condense ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <AlignJustify size={18} />
            </button>

            <button
              onClick={() => setShowRightPanel(v => !v)}
              title={showRightPanel ? t("hdr.hideRight") : t("hdr.showRight")}
              className={`p-1.5 rounded-md transition-colors ${showRightPanel ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <PanelRightIcon size={18} active={showRightPanel} />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {showSidebar && (
            <Sidebar
              tasks={tasks}
              filters={filters}
              setFilter={setFilter}
              clearFilter={clearFilter}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}

          <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 space-y-4"
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if (e.target.closest("[data-task-id]") || e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea")) return;
                  e.preventDefault(); // prevent text selection during drag
                  const bounds = e.currentTarget.getBoundingClientRect();
                  dragStartRef.current = { x: e.clientX, y: e.clientY, bounds };
                  didDragRef.current = false;
                }}
                onClick={(e) => {
                  if (didDragRef.current) { didDragRef.current = false; return; }
                  if (e.target === e.currentTarget) setSelected(new Set());
                }}>
            {/* Tab-zone sentinel: receives focus when Tab lands on the task list zone */}
            <button
              id="task-list"
              tabIndex={-1}
              aria-label="Task list"
              className="absolute opacity-0 w-px h-px overflow-hidden pointer-events-none"
              onKeyDown={e => {
                if (e.key !== "Tab") return;
                e.preventDefault();
                document.getElementById(e.shiftKey ? "quick-entry" : "search-input")?.focus();
              }}
            />
            <QuickEntry onAdd={handleAdd} />
            <SortBar sort={sort} onToggle={toggleSort} />

            {(hasAnyFilter || calendarFilter) && (
              <div className="flex items-center gap-1.5 text-sm flex-wrap">
                <span className={TC.textMuted}>{t("filter.label")}</span>
                {filters.status && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    {t("status." + filters.status)}
                    <button onClick={() => clearFilter("status")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {filters.dateRange && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    {t("agenda." + filters.dateRange)}
                    <button onClick={() => clearFilter("dateRange")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {filters.list && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    {filters.list}
                    <button onClick={() => clearFilter("list")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {filters.tag && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    #{filters.tag}
                    <button onClick={() => clearFilter("tag")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {filters.persona && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    {filters.persona}
                    <button onClick={() => clearFilter("persona")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {filters.flow && (
                  <span className="inline-flex items-center gap-1 bg-sky-600/20 text-sky-300 px-2 py-0.5 rounded text-xs">
                    {filters.flow}
                    <button onClick={() => clearFilter("flow")} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
                {calendarFilter && (
                  <span className="inline-flex items-center gap-1 bg-violet-600/20 text-violet-300 px-2 py-0.5 rounded text-xs">
                    {calendarBadgeDate}
                    <button onClick={() => setCalendarFilter(null)} className="hover:text-white"><X size={10} /></button>
                  </span>
                )}
              </div>
            )}

            {filtered.length === 0 ? (
              <div className={`text-center py-12 ${TC.textMuted}`}>
                <Inbox size={40} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {tasks.length === 0 ? (
                    <>
                      {t("empty.msgBefore")}
                      <button onClick={() => setShowDemoConfirm(true)}
                        className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors">
                        {t("empty.msgLink")}
                      </button>
                      {t("empty.msgAfter")}
                    </>
                  ) : (
                    t("empty.filtered")
                  )}
                </p>
              </div>
            ) : (
              <div className={settings.condense ? "space-y-0" : "space-y-1"}>
                {(() => {
                  const rows = [];
                  displayFiltered.forEach((task, idx) => {
                    if (idx === 0 && overdueCount > 0) {
                      rows.push(<SectionDivider key="__overdue_header" label={t("group.overdue")} count={overdueCount} />);
                    }
                    if (idx === overdueCount && overdueCount > 0) {
                      rows.push(<div key="__overdue_gap" className="h-3" />);
                    }
                    rows.push(
                      <div
                        key={task.id}
                        draggable={showPlanner}
                        onDragStart={(e) => {
                          const ids = selected.size > 0 && selected.has(task.id) ? [...selected] : [task.id];
                          e.dataTransfer.setData("text/task-ids", ids.join(","));
                          e.dataTransfer.effectAllowed = "move";
                          // Custom drag image: planner-style block matching slot appearance
                          const pColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4];
                          const ghost = document.createElement("div");
                          Object.assign(ghost.style, {
                            position: "fixed", left: "0px", top: "-500px",
                            width: "200px", minHeight: "50px",
                            borderRadius: "6px", fontSize: "12px",
                            background: `${pColor}25`, border: `1px solid ${pColor}`,
                            borderLeft: `3px solid ${pColor}`,
                            color: "#e2e8f0", padding: "6px 10px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                            fontFamily: "monospace",
                          });
                          const title = document.createElement("div");
                          title.textContent = ids.length > 1 ? `${ids.length} tasks` : task.title;
                          Object.assign(title.style, { fontWeight: "600", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" });
                          ghost.appendChild(title);
                          if (task.list || task.tags?.length) {
                            const meta = document.createElement("div");
                            meta.style.cssText = "font-size:10px; color:#38bdf8; opacity:0.7; margin-top:2px;";
                            meta.textContent = [task.list ? `@${task.list}` : "", ...(task.tags || []).slice(0, 2).map(t => `#${t}`)].filter(Boolean).join(" ");
                            ghost.appendChild(meta);
                          }
                          document.body.appendChild(ghost);
                          e.dataTransfer.setDragImage(ghost, 100, 25);
                          setTimeout(() => ghost.remove(), 200);
                        }}
                      >
                      <TaskRow
                        task={task}
                        isCursor={idx === cursor}
                        isSelected={selected.has(task.id)}
                        isBlocked={blockedIds.has(task.id)}
                        compact={showRightPanel}
                        dataGuide={idx === 0 ? "task-row" : undefined}
                        onStatusCycle={async () => {
                          const result = await store.bulkCycle(new Set([task.id]), tasks);
                          showFlowToasts(result);
                        }}
                        onClick={(e) => handleRowClick(e, task.id, idx)}
                        onCheckboxClick={() => handleCheckboxClick(task)}
                        onDoubleClick={(e) => { e.preventDefault(); handleEditFull(task.id); }}
                        onContextMenu={(e) => handleContextMenu(e, task)}
                      />
                      </div>
                    );
                  });
                  return rows;
                })()}
              </div>
            )}

            {activeFlowName && <FlowView tasks={tasks} activeFlow={activeFlowName} onStartNext={handleFlowStartNext} onUpdateFlow={handleFlowUpdate} onDeleteFlow={handleFlowDelete} />}
          </main>

          {selected.size > 0 && (
            <div className="px-6 py-3 flex-shrink-0">
              <BulkBar count={selected.size} onDone={bulkDone} onCycle={bulkCycle} onToday={bulkToday} onShift={bulkShift} onDelete={bulkDelete} onClear={() => setSelected(new Set())} />
            </div>
          )}
          <StatusBar tasks={tasks} lastAction={lastAction} canUndo={store.canUndo} clockFormat={settings.clockFormat} dateFormat={settings.dateFormat} dbPath={store.dbPath} lastSync={store.metaSettings?.last_sync} onSyncNow={gdriveConnected ? wrappedSyncNow : undefined} autoSyncing={autoSyncing} onOpenSyncSettings={() => setShowSettings("sync")} />
          </div>

          {showPlanner && (<>
            {/* Resizable divider */}
            <div
              ref={plannerDividerRef}
              className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-white/10 active:bg-white/15 transition-colors relative group"
              onMouseDown={(e) => {
                e.preventDefault();
                const container = e.currentTarget.parentElement;
                const onMove = (ev) => {
                  const containerRect = container.getBoundingClientRect();
                  const rightPanel = container.querySelector('[data-guide="detail-panel"]');
                  const plannerRight = rightPanel ? rightPanel.getBoundingClientRect().left : containerRect.right;
                  const plannerPx = plannerRight - ev.clientX;
                  const pct = (plannerPx / containerRect.width) * 100;
                  setPlannerWidthPct(Math.max(20, Math.min(60, pct)));
                };
                const onUp = () => {
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                };
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/5 group-hover:bg-white/20 transition-colors" />
            </div>
            <div className="flex-shrink-0 overflow-hidden" style={{ width: `${plannerWidthPct}%` }}>
              <DayPlanner
                slots={store.dayPlanSlots || []}
                currentPlan={store.currentPlan}
                tasks={tasks}
                selectedDate={plannerDate}
                onSelectDate={setPlannerDate}
                onDropTask={handlePlannerDropTask}
                onMoveSlot={handlePlannerMoveSlot}
                onResizeSlot={handlePlannerResizeSlot}
                onRemoveSlot={handlePlannerRemoveSlot}
                onBlockSlot={handlePlannerBlockSlot}
                onUnblockSlot={(slotId) => store.plannerRemoveSlot?.(slotId, tasks)}
                onUpdateSlotTitle={(slotId, title) => store.plannerUpdateSlotTitle?.(slotId, title)}
                onUpdateSlotRecurrence={(slotId, rec) => store.plannerUpdateSlotRecurrence?.(slotId, rec)}
                onCompleteTask={(taskId) => {
                  const task = tasks.find(t => t.id === taskId);
                  handleUpdate(taskId, { status: task?.status === "done" ? "active" : "done" });
                }}
                onEditTask={(taskId) => setEditTaskId(taskId)}
                onCreateTaskHere={handlePlannerCreateTask}
                onSelectTask={(taskId) => { setCursor(displayFiltered.findIndex(t => t.id === taskId)); setSelected(new Set([taskId])); }}
                slotStep={settings.plannerSlotStep ?? 30}
                settingsDayStart={settings.plannerDayStart}
                settingsDayEnd={settings.plannerDayEnd}
              />
            </div>
          </>)}

          {showRightPanel && (
            <div data-guide="detail-panel" className={`w-64 flex-shrink-0 border-l flex flex-col overflow-hidden ${TC.borderClass}`}>
              {showCalendar && (
                <CalendarPanel tasks={tasks} calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter} dateRange={filters.dateRange} />
              )}
              <div className="flex-1 overflow-y-auto">
                <DetailPanel selected={selected} tasks={tasks} onUpdate={handleUpdate} onEditFull={handleEditFull} />
              </div>
            </div>
          )}
        </div>

        <ToastContainer toasts={toasts} />

        {/* Custom context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            task={contextMenu.task}
            selectedIds={selected}
            onClose={() => setContextMenu(null)}
            onOpen={handleCtxOpen}
            onAssignToday={handleCtxAssignToday}
            onSnooze={handleCtxSnooze}
            onSetStatus={handleCtxSetStatus}
            onMarkDone={handleCtxMarkDone}
            onDuplicate={handleCtxDuplicate}
            onDelete={handleCtxDelete}
          />
        )}

        {/* Rubber-band selection rectangle */}
        {dragRect && (() => {
          const x = Math.min(dragRect.x1, dragRect.x2);
          const y = Math.min(dragRect.y1, dragRect.y2);
          const w = Math.abs(dragRect.x2 - dragRect.x1);
          const h = Math.abs(dragRect.y2 - dragRect.y1);
          return (
            <div style={{
              position: "fixed", left: x, top: y, width: w, height: h,
              border: "1.5px dashed rgba(14,165,233,.75)",
              background: "rgba(14,165,233,.06)",
              borderRadius: 3,
              pointerEvents: "none",
              zIndex: 9999,
            }} />
          );
        })()}

        {confirmPending && (
          <ConfirmDialog
            message={confirmMessage()}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmPending(null)}
          />
        )}

        {editTaskId && (() => {
          const editTask = tasks.find(t => t.id === editTaskId);
          return editTask ? (
            <TaskEditDialog
              task={editTask}
              tasks={tasks}
              onSave={handleEditSave}
              onCancel={() => setEditTaskId(null)}
            />
          ) : null;
        })()}

        {rtmImportData && (
          <RtmImportDialog
            data={rtmImportData}
            onConfirm={handleRtmImport}
            onCancel={() => setRtmImportData(null)}
          />
        )}

        {importProgress && (
          <ImportProgressOverlay
            current={importProgress.current}
            total={importProgress.total}
          />
        )}

        {showSettings && (
          <SettingsDialog
            initialTab={typeof showSettings === "string" ? showSettings : undefined}
            onClose={() => setShowSettings(false)}
            onTriggerRtmImport={() => rtmFileRef.current?.click()}
            tasks={tasks}
            onClearAll={async () => {
              await store.clearAll?.();
              setSelected(new Set());
              setCursor(0);
              clearAllFilters();
              setCalendarFilter(null);
              setSearchQuery("");
              setSort(null);
            }}
            dbPath={store.dbPath}
            onRevealDb={store.revealDb}
            onOpenDb={async () => { const ok = await store.openNewDb(); if (ok) setShowDbSwitched(true); }}
            onCreateNewDb={async () => { const ok = await store.createNewDb(); if (ok) setShowDbSwitched(true); }}
            onMoveDb={store.moveCurrentDb}
            onRestartGuide={() => {
              setGuideStep(0);
              saveMetaRef.current?.("to_guide_completed", "false");
            }}
            onCreateBackup={store.createBackup}
            onListBackups={store.listBackups}
            onRestoreBackup={store.restoreBackup}
            onExportSync={store.exportSync}
            onImportSync={store.importSync}
            onExportSyncRequest={store.exportSyncRequest}
            onHandleSyncRequest={store.handleSyncRequest}
            onImportSyncClipboard={store.importSyncClipboard}
            onGetSyncLog={store.getSyncLog}
            onGetSyncStats={store.getSyncStats}
            onClearSyncData={store.clearSyncData}
            onGdriveCheckConnection={store.gdriveCheckConnection}
            onGdriveConnect={store.gdriveConnectAccount}
            onGdriveDisconnect={store.gdriveDisconnectAccount}
            onGdriveSyncNow={store.gdriveSyncNow}
            onGdriveGetConfig={store.gdriveGetConfig}
            onGdriveCheckSyncFile={store.gdriveCheckSyncFile}
            onGdrivePurgeSyncFile={store.gdrivePurgeSyncFile}
            onGdriveReadSyncFile={store.gdriveReadSyncFile}
            gdriveLog={gdriveLog}
            onGdriveLog={setGdriveLog}
          />
        )}

        {/* Demo data confirmation dialog */}
        {showDemoConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className={`rounded-xl border p-6 max-w-sm w-full mx-4 shadow-2xl ${TC.surface} ${TC.borderClass}`}>
              <h3 className={`font-semibold text-base mb-2 ${TC.text}`}>{t("demo.title")}</h3>
              <p className={`text-sm mb-5 leading-relaxed ${TC.textSec}`}>{t("demo.desc")}</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDemoConfirm(false)}
                  className={`px-4 py-1.5 rounded text-sm transition-colors ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}>
                  {t("demo.cancel")}
                </button>
                <button onClick={async () => {
                    setShowDemoConfirm(false);
                    try { await store.loadDemoData?.(buildDemoTasks()); } catch (e) { console.error('[loadDemoData]', e); }
                  }}
                  className="px-4 py-1.5 rounded text-sm bg-sky-600 hover:bg-sky-500 text-white transition-colors font-medium">
                  {t("demo.confirm")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DB switched info dialog */}
        {showDbSwitched && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className={`rounded-xl border p-6 max-w-sm w-full mx-4 shadow-2xl ${TC.surface} ${TC.borderClass}`}>
              <h3 className={`font-semibold text-base mb-2 ${TC.text}`}>{t("db.switched.title")}</h3>
              <p className={`text-sm mb-1 leading-relaxed ${TC.textSec}`}>{t("db.switched.desc")}</p>
              <p className={`text-xs mb-5 font-mono break-all ${TC.textMuted}`}>{store.dbPath}</p>
              <div className="flex justify-end">
                <button onClick={() => setShowDbSwitched(false)}
                  className="px-4 py-1.5 rounded text-sm bg-sky-600 hover:bg-sky-500 text-white transition-colors font-medium">
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input for RTM JSON import */}
        <input
          ref={rtmFileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleRtmFileSelect}
        />
      </div>

      {/* UI Guide overlay */}
      {guideStep >= 0 && guideStep < GUIDE_STEPS.length && (
        <GuideOverlay
          step={guideStep}
          total={GUIDE_STEPS.length}
          target={GUIDE_STEPS[guideStep].target}
          titleKey={GUIDE_STEPS[guideStep].titleKey}
          descKey={GUIDE_STEPS[guideStep].descKey}
          onNext={() => {
            if (guideStep < GUIDE_STEPS.length - 1) {
              let next = guideStep + 1;
              // Skip steps where target element is missing
              while (next < GUIDE_STEPS.length && !document.querySelector(`[data-guide="${GUIDE_STEPS[next].target}"]`)) next++;
              if (next < GUIDE_STEPS.length) setGuideStep(next);
              else { setGuideStep(-1); saveMetaRef.current?.("to_guide_completed", "true"); }
            } else {
              setGuideStep(-1);
              saveMetaRef.current?.("to_guide_completed", "true");
            }
          }}
          onBack={() => {
            let prev = guideStep - 1;
            while (prev >= 0 && !document.querySelector(`[data-guide="${GUIDE_STEPS[prev].target}"]`)) prev--;
            if (prev >= 0) setGuideStep(prev);
          }}
          onSkip={() => { setGuideStep(-1); saveMetaRef.current?.("to_guide_completed", "true"); }}
        />
      )}
    </AppContext.Provider>
  );
}
