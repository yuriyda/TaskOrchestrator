/**
 * TaskOrchestrator.tsx — main UI component tree for the task management app.
 * Contains all React components: sidebar, task list, detail panel, dialogs, calendar, etc.
 * Domain logic, constants, parsers, and store are imported from sibling modules.
 */
import { useState, useReducer, useRef, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { Search, Plus, Check, CheckCircle2, X, Inbox, List, ArrowRight, CornerDownRight, Repeat, Flag, Calendar, Hash, Filter, Keyboard, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, Settings, Sun, Moon, Monitor, FileText, Link, Clock, Upload, User, Download, Trash2, AlertTriangle, Info, Globe, AlignJustify, HardDrive, FolderOpen, Copy, Lock, Play, Palette, Edit3, ExternalLink } from "lucide-react";
import { STATUSES, STATUS_ICONS, PRIORITY_COLORS, SORT_FIELDS, FONTS, DATE_FORMATS, CSV_FIELDS } from "./core/constants.js";
import { parseDateInput, fmtDate } from "./core/date.js";
import { OVERDUE_DATE_CLS, OVERDUE_STRIPE, OVERDUE_BG } from "./core/overdue.js";
import { ruPlural, humanRecurrence } from "./core/recurrence.js";
import { CHIP_STYLE, parseShorthand, getSuggestions, getTokenType, tryCommitToken, buildFromChips } from "./parse/quickEntry.js";
import { MOCK_LISTS, MOCK_TAGS, MOCK_FLOWS, MOCK_PERSONAS, INITIAL_TASKS, buildDemoTasks } from "./core/demo.js";
import { useTaskStore } from "./store/memoryStore.js";
export { useTaskStore };

import { AppContext, useApp } from "./ui/AppContext.jsx";
import { PanelLeftIcon, PanelRightIcon, AutoThemeIcon, themeOptions } from "./ui/icons.jsx";
import { PriorityBadge, StatusBadge } from "./ui/badges.jsx";
import { TokenChip, ChipPill, SectionDivider, ConfirmDialog, BulkBar, ToastContainer } from "./ui/common.jsx";
import { ContextMenu } from "./ui/ContextMenu.jsx";
import { QuickEntry } from "./ui/QuickEntry.jsx";
import { TaskRow } from "./ui/TaskRow.jsx";
import { Combobox } from "./ui/Combobox.jsx";
import { SettingsDialog } from "./ui/SettingsDialog.jsx";
import { Sidebar } from "./ui/Sidebar.jsx";
import { FlowView } from "./ui/FlowView.jsx";
import { CalendarPanel } from "./ui/CalendarPanel.jsx";
import { DatePicker, DatePickerAnchor, DateField } from "./ui/DatePicker.jsx";
import { DetailPanel } from "./ui/DetailPanel.jsx";
import { TaskEditDialog } from "./ui/TaskEditDialog.jsx";
import { RtmImportDialog, ImportProgressOverlay } from "./ui/RtmImportDialog.jsx";
import { SortBar } from "./ui/SortBar.jsx";
import { StatusBar } from "./ui/StatusBar.jsx";
import { GUIDE_STEPS, GuideOverlay } from "./ui/GuideOverlay.jsx";
import { DayPlanner } from "./ui/DayPlanner.jsx";
import { useSettings } from "./hooks/useSettings";
import { useSync } from "./hooks/useSync";
import { useDayPlanner } from "./hooks/useDayPlanner";
import { useKeyboard } from "./hooks/useKeyboard";
import { useTaskActions } from "./hooks/useTaskActions";
import { useFilteredTasks } from "./hooks/useFilteredTasks";

// ─── App ──────────────────────────────────────────────────────────────────────

interface TaskOrchestratorProps {
  storeHook?: () => any
}

export default function TaskOrchestrator({ storeHook = useTaskStore }: TaskOrchestratorProps = {}) {
  const saveMetaRef = useRef(null);

  // ── Settings / i18n / theme ───────────────────────────────────────────────
  const {
    guideStep, setGuideStep, locale, setLocale, theme, setTheme,
    resolvedTheme, TC, t, settings, updateSetting, showSettings, setShowSettings,
    applyMeta,
  } = useSettings(saveMetaRef);

  // ── Task state ────────────────────────────────────────────────────────────
  const store = storeHook();
  const { tasks } = store;

  // ── Google Drive sync ─────────────────────────────────────────────────────
  const {
    gdriveConnected, gdriveLog, setGdriveLog, addGdriveLog,
    wrappedSyncNow, autoSyncing, autoSyncTimerRef,
  } = useSync(store, tasks, locale, t, settings);

  // Wire the saveMeta ref so updateSetting / locale / theme effects can use it
  saveMetaRef.current = store.saveMeta ?? null;

  // Apply settings loaded from SQLite (runs once when metaSettings arrives)
  const metaApplied = useRef(false);
  useEffect(() => {
    if (!store.metaSettings || metaApplied.current) return;
    metaApplied.current = true;
    applyMeta(store.metaSettings);
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
  const { filtered, displayFiltered, overdueCount, blockedIds } = useFilteredTasks({
    tasks, filters, searchQuery, calendarFilter, sort, locale,
    cursor, setCursor, setSelected,
  });

  const handleUpdate = (id, rawChanges) => {
    const { __title__, ...rest } = rawChanges;
    const changes = __title__ !== undefined ? { ...rest, title: __title__ } : rawChanges;
    store.updateTask(id, changes, tasks).then(showFlowToasts);
  };

  // ── Day Planner integration ────────────────────────────────────────────
  const {
    handlePlannerDropTask, handlePlannerMoveSlot, handlePlannerResizeSlot,
    handlePlannerRemoveSlot, handlePlannerBlockSlot, handlePlannerCreateTask,
    pendingSlotTimeRef,
  } = useDayPlanner({ store, tasks, settings, t, handleUpdate, showPlanner, plannerDate });

  // ── Keyboard, rubber-band, context menu suppression ────────────────────────
  useKeyboard({
    store, tasks, displayFiltered, cursor, setCursor, selected, setSelected,
    lastIdx, setLastIdx, blockedIds, addToast, showFlowToasts, t, locale,
    searchQuery, setSearchQuery, searchExpanded, setSearchExpanded, searchInputRef,
    showSettings, setShowSettings, editTaskId, setEditTaskId,
    contextMenu, setContextMenu, confirmPending, setConfirmPending,
    clearAllFilters, autoSyncTimerRef, setShowPlanner, setShowDbSwitched,
    dragStartRef, didDragRef, setDragRect, filtered,
  });

  // ── Task actions (context menu, flow, bulk, add, edit, RTM, confirm) ─────
  const {
    handleContextMenu, handleCtxOpen, handleCtxAssignToday, handleCtxSnooze,
    handleCtxMarkDone, handleCtxSetStatus, handleCtxDuplicate, handleCtxDelete,
    handleFlowStartNext, handleFlowUpdate, handleFlowDelete,
    handleRowClick, bulkDone, bulkCycle, bulkShift, bulkToday, bulkDelete,
    handleAdd, handleEditFull, handleEditSave,
    handleRtmFileSelect, handleRtmImport,
    handleCheckboxClick, handleConfirm, confirmMessage,
  } = useTaskActions({
    store, tasks, locale, t, filters, selected, setSelected, setCursor,
    blockedIds, addToast, showFlowToasts, setContextMenu, editTaskId, setEditTaskId,
    confirmPending, setConfirmPending, filtered, lastIdx, setLastIdx,
    clearFilter, settings, pendingSlotTimeRef,
    setRtmImportData, rtmImportData, setImportProgress,
    handleUpdate,
  });

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
                        isPlanned={store.plannedTaskIds?.has(task.id)}
                        hideStatus={!!filters.status}
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

            {activeFlowName && <FlowView tasks={tasks} activeFlow={activeFlowName} onStartNext={handleFlowStartNext} onUpdateFlow={handleFlowUpdate} onDeleteFlow={handleFlowDelete}
              onCompleteTask={(id) => handleUpdate(id, { status: "done" })}
              onReopenTask={(id) => handleUpdate(id, { status: "active" })}
              onEditTask={(id) => setEditTaskId(id)}
              onDeleteTask={(id) => { store.bulkDelete(new Set([id]), tasks); }}
              onRemoveFromFlow={(id) => handleUpdate(id, { flowId: null })}
              onRemoveDependency={(id) => handleUpdate(id, { dependsOn: null })}
            />}
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
            filteredTasks={filtered}
            hasActiveFilter={hasAnyFilter || !!calendarFilter}
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
