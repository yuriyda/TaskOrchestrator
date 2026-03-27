import { useState, useReducer, useRef, useEffect, useMemo, createContext, useContext } from "react";
import { Search, Plus, Check, CheckCircle2, X, Inbox, List, Zap, ArrowRight, CornerDownRight, Repeat, Flag, Calendar, Hash, Filter, Keyboard, ChevronLeft, ChevronRight, ChevronsDown, ChevronsUp, Settings, Sun, Moon, Monitor, FileText, Link, Clock, Upload, User, Download, Trash2, AlertTriangle, Info, Globe, AlignJustify, HardDrive, FolderOpen, Copy, Lock, Play, Palette, Edit3, ExternalLink } from "lucide-react";
import { ulid } from "./tauri-app/src/ulid.js";

// ─── Panel toggle icons ───────────────────────────────────────────────────────
const PanelLeftIcon = ({ size = 18, active = false }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" />
    <line x1="7" y1="2.5" x2="7" y2="17.5" />
    {active && <rect x="1.5" y="2.5" width="5.5" height="15" rx="1.5"
                     fill="currentColor" fillOpacity="0.25" stroke="none" />}
  </svg>
);

const PanelRightIcon = ({ size = 18, active = false }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" />
    <line x1="13" y1="2.5" x2="13" y2="17.5" />
    {active && <rect x="13" y="2.5" width="5.5" height="15" rx="1.5"
                     fill="currentColor" fillOpacity="0.25" stroke="none" />}
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES    = ["inbox", "active", "done", "cancelled"];
const STATUS_ICONS = { inbox: Inbox, active: Zap, done: Check, cancelled: X };
const PRIORITY_COLORS = { 1: "#ef4444", 2: "#fb923c", 3: "#60a5fa", 4: "#6b7280" };
const STATUS_ORDER    = { inbox: 0, active: 1, done: 2, cancelled: 3 };
const SORT_FIELDS     = ["priority", "status", "due", "createdAt"];

// ─── Keyboard layout swap (QWERTY ↔ ЙЦУКЕН) ─────────────────────────────────
const _EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const _RU = "йцукенгшщзхъфывапролджэячсмитьбю";
const _layoutMap = {};
for (let i = 0; i < _EN.length; i++) { _layoutMap[_EN[i]] = _RU[i]; _layoutMap[_RU[i]] = _EN[i]; }
function swapLayout(str) {
  let out = "";
  for (const ch of str) out += _layoutMap[ch] || ch;
  return out;
}

const LOCALE_NAMES = { en: "English", ru: "Русский" };

const FONTS = [
  { label: "System default",  value: "" },
  { label: "Inter",           value: "Inter, sans-serif" },
  { label: "Roboto",          value: "Roboto, sans-serif" },
  { label: "Open Sans",       value: "'Open Sans', sans-serif" },
  { label: "Lato",            value: "Lato, sans-serif" },
  { label: "Montserrat",      value: "Montserrat, sans-serif" },
  { label: "Courier New",        value: "'Courier New', monospace" },
  { label: "JetBrains Mono NL", value: "'JetBrains Mono NL', monospace" },
  { label: "Georgia",            value: "Georgia, serif" },
];

const DATE_FORMATS = ["iso", "dmy", "short", "us", "long"];

// ─── Color themes ─────────────────────────────────────────────────────────────

const COLOR_THEMES = {
  default: {
    swatches: ["#0ea5e9", "#8b5cf6", "#374151"],
    dark: {
      root:       "bg-gray-900 text-gray-100",
      header:     "border-gray-700/50 bg-gray-900",
      aside:      "border-gray-700/50 bg-gray-900",
      surface:    "bg-gray-800",
      surfaceAlt: "bg-gray-800/50",
      elevated:   "bg-gray-700",
      borderClass:"border-gray-700/50",
      input:      "bg-gray-800 border-gray-600",
      inputText:  "text-gray-100 placeholder-gray-500",
      text:       "text-gray-100",
      textSec:    "text-gray-400",
      textMuted:  "text-gray-500",
      hoverBg:    "hover:bg-gray-800",
      taskHoverBg:    "rgba(55,65,81,.25)",
      taskHoverShadow:"0 0 0 1px rgba(107,114,128,.4)",
      scrollTrack: "#111827", scrollThumb: "#374151", scrollThumbHover: "#4b5563",
    },
    light: {
      root:       "bg-gray-50 text-gray-900",
      header:     "border-gray-200 bg-white",
      aside:      "border-gray-200 bg-white",
      surface:    "bg-white",
      surfaceAlt: "bg-gray-100/70",
      elevated:   "bg-gray-100",
      borderClass:"border-gray-200",
      input:      "bg-white border-gray-300",
      inputText:  "text-gray-900 placeholder-gray-400",
      text:       "text-gray-900",
      textSec:    "text-gray-600",
      textMuted:  "text-gray-400",
      hoverBg:    "hover:bg-gray-100",
      taskHoverBg:    "rgba(203,213,225,.4)",
      taskHoverShadow:"0 0 0 1px rgba(100,116,139,.3)",
      scrollTrack: "#f1f5f9", scrollThumb: "#cbd5e1", scrollThumbHover: "#94a3b8",
    },
  },
  gruvbox: {
    swatches: ["#d79921", "#98971a", "#282828"],
    dark: {
      root:       "bg-[#282828] text-[#ebdbb2]",
      header:     "border-[#504945] bg-[#282828]",
      aside:      "border-[#504945] bg-[#282828]",
      surface:    "bg-[#3c3836]",
      surfaceAlt: "bg-[#3c3836]/50",
      elevated:   "bg-[#504945]",
      borderClass:"border-[#504945]",
      input:      "bg-[#3c3836] border-[#504945]",
      inputText:  "text-[#ebdbb2] placeholder-[#928374]",
      text:       "text-[#ebdbb2]",
      textSec:    "text-[#d5c4a1]",
      textMuted:  "text-[#928374]",
      hoverBg:    "hover:bg-[#3c3836]",
      taskHoverBg:    "rgba(60,56,54,.5)",
      taskHoverShadow:"0 0 0 1px rgba(80,73,69,.7)",
      scrollTrack: "#1d2021", scrollThumb: "#504945", scrollThumbHover: "#665c54",
    },
    light: {
      root:       "bg-[#fbf1c7] text-[#3c3836]",
      header:     "border-[#d5c4a1] bg-[#fbf1c7]",
      aside:      "border-[#d5c4a1] bg-[#fbf1c7]",
      surface:    "bg-[#ebdbb2]",
      surfaceAlt: "bg-[#ebdbb2]/70",
      elevated:   "bg-[#d5c4a1]",
      borderClass:"border-[#d5c4a1]",
      input:      "bg-[#ebdbb2] border-[#d5c4a1]",
      inputText:  "text-[#3c3836] placeholder-[#928374]",
      text:       "text-[#3c3836]",
      textSec:    "text-[#504945]",
      textMuted:  "text-[#928374]",
      hoverBg:    "hover:bg-[#d5c4a1]",
      taskHoverBg:    "rgba(213,196,161,.5)",
      taskHoverShadow:"0 0 0 1px rgba(168,153,132,.5)",
      scrollTrack: "#ebdbb2", scrollThumb: "#d5c4a1", scrollThumbHover: "#bdae93",
    },
  },
};

function buildTC(resolvedTheme, colorTheme = "default") {
  const theme = COLOR_THEMES[colorTheme] ?? COLOR_THEMES.default;
  return resolvedTheme === "light" ? theme.light : theme.dark;
}

const CSV_FIELDS = [
  { key: "title",      labelEn: "Title",      labelRu: "Название" },
  { key: "status",     labelEn: "Status",     labelRu: "Статус" },
  { key: "priority",   labelEn: "Priority",   labelRu: "Приоритет" },
  { key: "list",       labelEn: "List",       labelRu: "Список" },
  { key: "tags",       labelEn: "Tags",       labelRu: "Теги" },
  { key: "personas",   labelEn: "Personas",   labelRu: "Персонажи" },
  { key: "due",        labelEn: "Due date",   labelRu: "Дедлайн" },
  { key: "recurrence", labelEn: "Recurrence", labelRu: "Повторение" },
  { key: "flowId",     labelEn: "Task Flow",  labelRu: "Task Flow" },
  { key: "dependsOn",  labelEn: "Depends on", labelRu: "Зависит от" },
  { key: "url",        labelEn: "URL",        labelRu: "URL" },
  { key: "estimate",   labelEn: "Estimate",   labelRu: "Оценка" },
  { key: "createdAt",  labelEn: "Created",    labelRu: "Создана" },
];


// ─── i18n ─────────────────────────────────────────────────────────────────────

const LOCALES = {
  en: {
    // statuses
    "status.inbox": "Inbox", "status.active": "Active",
    "status.done": "Done",   "status.cancelled": "Cancelled",
    // priorities
    "priority.1": "Urgent", "priority.2": "High", "priority.3": "Medium", "priority.4": "Low",
    // sort
    "sort.priority": "Priority", "sort.status": "Status", "sort.due": "Due",
    "sort.title": "Title", "sort.createdAt": "Created", "sort.label": "Sort:",
    // quick entry
    "qe.placeholder": "New task... (@list #tag !priority ^due >>flow ~depends *recur /persona)",
    // bulk bar
    "bulk.selected": "selected", "bulk.complete": "Complete",
    "bulk.cycle": "Cycle status", "bulk.shift": "+1 day", "bulk.delete": "Delete",
    // filter
    "filter.label": "Filter:", "filter.all": "All",
    "cf.label": "Show:", "cf.all": "All", "cf.active": "Active", "cf.done": "Done",
    // sidebar
    "sidebar.agenda": "Agenda",
    "agenda.today": "Today",    "agenda.tomorrow": "Tomorrow",
    "agenda.week": "Week",      "agenda.month": "Month",
    "agenda.overdue": "Overdue",
    "sidebar.status": "Status", "sidebar.lists": "Lists",
    "sidebar.tags": "Tags",    "sidebar.personas": "Personas",
    "sidebar.hotkeys": "Hotkeys",
    "sidebar.collapseAll": "Collapse all", "sidebar.expandAll": "Expand all",
    // hotkeys
    "hk.newTask": "New task",            "hk.cursor": "Move cursor + select",
    "hk.extend": "Extend selection",     "hk.selectAll": "Select all",
    "hk.complete": "Mark done",          "hk.cycle": "Cycle status",
    "hk.delete": "Delete",               "hk.priority": "Set priority",
    "hk.postpone": "Postpone due +1 day","hk.undo": "Undo",
    "hk.escape": "Clear selection / reset",
    "hk.homeEnd": "Jump to first / last",
    // detail panel
    "detail.empty": "Select a task\nto view its properties",
    "detail.tasksSelected": "tasks selected",
    "detail.task": "Task",     "detail.status": "Status",
    "detail.priority": "Priority", "detail.list": "List",
    "detail.tags": "Tags",     "detail.personas": "Personas",
    "detail.due": "Due date",
    "detail.recurrence": "Recurrence", "detail.flow": "Task Flow",
    "detail.dependsOn": "Depends on", "detail.created": "Created",
    "detail.completedAt": "Completed",
    "detail.url": "URL", "detail.dateStart": "Start date",
    "detail.estimate": "Estimate", "detail.postponed": "Postponed",
    "detail.notes": "Notes",
    "note.add": "Add note", "note.edit": "Edit", "note.delete": "Delete",
    "note.title": "Title (optional)", "note.content": "Content",
    "note.save": "Save", "note.cancel": "Cancel", "note.dblclick": "Double-click to edit",
    // edit
    "edit.title": "Edit Task", "edit.save": "Save", "edit.hint": "Double-click a task to edit",
    "edit.field.title": "Title", "edit.field.status": "Status",
    "edit.field.priority": "Priority", "edit.field.list": "List",
    "edit.field.tags": "Tags", "edit.field.personas": "Personas",
    "edit.field.due": "Due date",
    "edit.field.dateStart": "Start date", "edit.field.recurrence": "Recurrence",
    "edit.field.url": "URL", "edit.field.estimate": "Estimate",
    "edit.field.flow": "Task Flow", "edit.field.dependsOn": "Depends on",
    "edit.addTag": "Add tag…", "edit.addPersona": "Add persona…",
    "edit.newList": "New list…",
    // rtm import
    "rtm.importBtn": "Import from RTM",
    "rtm.dialogTitle": "Import from Remember The Milk",
    "rtm.tasks": "Tasks",    "rtm.active": "active",    "rtm.completed": "completed",
    "rtm.lists": "Lists",    "rtm.tags": "Tags",        "rtm.notes": "Notes",
    "rtm.includeCompleted": "Import completed & cancelled tasks",
    "rtm.skippedTitle": "The following will be skipped:",
    "rtm.skipLocations": "locations (not supported)",
    "rtm.skipSmartLists": "smart lists (not supported)",
    "rtm.skipSubtasks": "Subtask relationships",
    "rtm.skipSource": "Task source info",
    "rtm.importedToast": "Imported",
    "rtm.doImport": "Import",
    "rtm.records": "records",
    "rtm.importing": "Importing…",
    "rtm.importProgressOf": "of",
    "rtm.importTasks": "tasks",
    "rtm.importPleaseWait": "Please wait, do not close the application",
    // calendar
    "cal.clearFilter": "Clear filter",
    "cal.month.0": "January",  "cal.month.1": "February", "cal.month.2": "March",
    "cal.month.3": "April",    "cal.month.4": "May",      "cal.month.5": "June",
    "cal.month.6": "July",     "cal.month.7": "August",   "cal.month.8": "September",
    "cal.month.9": "October",  "cal.month.10": "November","cal.month.11": "December",
    "cal.day.0": "Mo", "cal.day.1": "Tu", "cal.day.2": "We", "cal.day.3": "Th",
    "cal.day.4": "Fr", "cal.day.5": "Sa", "cal.day.6": "Su",
    // task row
    "task.blocked": "blocked", "task.dependsOn": "Depends on:",
    "statusbadge.title": "Click to cycle status",
    // header
    "hdr.search": "Search tasks...",
    "hdr.found": "found", "hdr.tasks": "tasks", "hdr.completed": "completed",
    "hdr.hideLeft": "Hide sidebar",   "hdr.showLeft": "Show sidebar",
    "hdr.hideCal": "Hide calendar",   "hdr.showCal": "Show calendar",
    "hdr.hideRight": "Hide right panel", "hdr.showRight": "Show right panel",
    "hdr.condense": "Compact mode", "hdr.expand": "Comfortable mode",
    // confirm
    "confirm.yes": "Yes", "confirm.cancel": "Cancel",
    // toast
    "toast.undone": "Action undone",
    "toast.noNumericDue": "No tasks with a numeric due date",
    "toast.deleted": "Deleted",
    // empty state
    "empty.msg": "No tasks. Add your first one using Quick Entry!",
    "empty.msgBefore": "No tasks. Add your first one using Quick Entry or ",
    "empty.msgLink":   "fill with demo data",
    "empty.msgAfter":  "!",
    "empty.filtered":  "No tasks match the current filter.",
    "demo.title":   "Fill with test data?",
    "demo.desc":    "50 demo tasks will be added showcasing all app features: all statuses and priorities, lists, tags, personas, recurring tasks, task flows, dependencies, URLs, estimates, notes, and more.",
    "demo.confirm": "Fill",
    "demo.cancel":  "Cancel",
    // footer
    "footer.theme.auto": "Auto", "footer.theme.dark": "Dark", "footer.theme.light": "Light",
    "footer.settings": "Settings",
    "footer.dateLocale": "en-US",
    "footer.author": "by Yuriy Daybov",
    // settings dialog
    "settings.title": "Settings",
    "settings.tab.general": "General",
    "settings.tab.appearance": "Appearance",
    "settings.tab.ai": "AI Assistant",
    "settings.tab.import": "Import",
    "settings.tab.export": "Export",
    "settings.tab.about": "About",
    "settings.tab.danger": "Danger Zone",
    // general
    "settings.general.title": "General",
    "settings.general.language": "Interface language",
    "settings.general.firstDay": "First day of week",
    "settings.general.dateFormat": "Date format",
    "settings.general.firstDay.monday": "Monday",
    "settings.general.firstDay.sunday": "Sunday",
    "settings.general.dateFormat.iso": "ISO (2026-03-23)",
    "settings.general.dateFormat.dmy": "DD-MM-YYYY (23-03-2026)",
    "settings.general.dateFormat.short": "Short (23/03/2026)",
    "settings.general.dateFormat.us": "US (03/23/2026)",
    "settings.general.dateFormat.long": "Long (March 23, 2026)",
    // appearance
    "settings.appearance.title": "Appearance",
    "settings.appearance.theme": "Theme",
    "settings.appearance.font": "Font family",
    "settings.appearance.fontSystem": "System default",
    "settings.appearance.fontHint": "Type any font name installed on your system, or pick a suggestion.",
    "settings.appearance.fontReset": "Reset to system default",
    "settings.appearance.fontSize": "Font size",
    "settings.appearance.fontSize.normal": "Normal",
    "settings.appearance.fontSize.bigger": "Bigger",
    "settings.appearance.fontSize.biggest": "The Biggest",
    "settings.appearance.condense": "Row density",
    "settings.appearance.condense.off": "Comfortable",
    "settings.appearance.condense.on": "Compact",
    "settings.appearance.colorTheme": "Color theme",
    "settings.appearance.colorTheme.default": "Default",
    "settings.appearance.colorTheme.gruvbox": "Material Gruvbox",
    // ai
    "settings.ai.title": "AI Assistant",
    "settings.ai.comingSoon": "AI integration is coming soon. Stay tuned for updates.",
    // import
    "settings.import.title": "Import",
    "settings.import.rtm": "Import from Remember The Milk",
    "settings.import.rtmDesc": "Upload a JSON export from RTM to import your tasks into Task Orchestrator.",
    "settings.import.rtmBtn": "Choose file…",
    // export
    "settings.export.title": "Export",
    "settings.export.csv": "Export to CSV",
    "settings.export.csvDesc": "Download all your tasks as a CSV file. Choose which fields to include.",
    "settings.export.fields": "Fields to include",
    "settings.export.csvBtn": "Export CSV",
    // about
    "settings.about.title": "About",
    "settings.about.version": "Version",
    "settings.about.description": "Task Orchestrator — a powerful personal task management application with support for lists, tags, personas, recurring tasks, and more.",
    // danger zone
    "settings.danger.title": "Danger Zone",
    "settings.danger.clearAll": "Clear all tasks",
    "settings.danger.clearAllDesc": "Permanently delete all tasks from the database. This action cannot be undone.",
    "settings.danger.clearBtn": "Clear All Tasks",
    "settings.danger.confirm1": "Are you sure? This will permanently delete ALL tasks.",
    "settings.danger.confirm2": "Type DELETE to confirm:",
    "settings.danger.confirmBtn": "Yes, delete everything",
    "settings.danger.cancelBtn": "Cancel",
    // context menu
    "ctx.open": "Open",
    "ctx.snooze1d": "Snooze 1 day",
    "ctx.snooze1w": "Snooze 1 week",
    "ctx.snooze1m": "Snooze 1 month",
    "ctx.markDone": "Mark as done",
    "ctx.markDoneMulti": "Mark as done",
    "ctx.duplicate": "Duplicate",
    "ctx.delete": "Delete",
    "ctx.deleteSelected": "Delete selected",
    "ctx.setStatus": "Set status",
    "ctx.selectedCount": "{n} tasks selected",
    // flow
    "flow.blocked": "Blocked",
    "flow.startNext": "Start next",
    "flow.progress": "Progress",
    "flow.noDescription": "No description",
    "flow.deadline": "Deadline",
    "flow.description": "Description",
    "flow.color": "Color",
    "flow.editMeta": "Edit flow",
    "flow.deleteFlow": "Delete flow",
    "flow.deleteConfirm": "Delete flow \"{name}\"? Tasks will lose their flow assignment.",
    "flow.activated": "Auto-activated: {names}",
    "flow.skippedBlocked": "Skipped {n} blocked task(s)",
    "flow.readyHint": "Ready to start",
    // maintenance
    "group.overdue": "Overdue",
    "settings.tab.maintenance": "Maintenance",
    "settings.maintenance.title": "Maintenance",
    "settings.maintenance.currentDb": "Current database",
    "settings.maintenance.copyPath": "Copy path",
    "settings.maintenance.copied": "Copied!",
    "settings.maintenance.reveal": "Show in Explorer",
    "settings.maintenance.open.label": "Open another database",
    "settings.maintenance.open.desc": "Switch to an existing .db file. The current database will not be modified.",
    "settings.maintenance.open.btn": "Open…",
    "settings.maintenance.move.label": "Move database",
    "settings.maintenance.move.desc": "Copy the current database to a new folder and switch to it. The original file will be deleted.",
    "settings.maintenance.move.btn": "Move to…",
    "guide.step.sidebar.title": "Sidebar Navigation",
    "guide.step.sidebar.desc": "Browse your tasks by agenda, status, lists, tags, personas, and task flows. Click any item to filter the task list.",
    "guide.step.createTask.title": "Create a Task",
    "guide.step.createTask.desc": "Type a task name and press Enter. Use shortcuts: @list, #tag, !priority, ^due, >>flow, ~depends, *recurrence, /persona.",
    "guide.step.taskRow.title": "Task Row",
    "guide.step.taskRow.desc": "Click to select, right-click for context menu (snooze, duplicate, delete). Click the status icon to cycle through statuses.",
    "guide.step.detailPanel.title": "Detail Panel",
    "guide.step.detailPanel.desc": "View and edit task properties: status, priority, list, tags, due date, notes, and more.",
    "guide.step.sortFilter.title": "Sort & Filter",
    "guide.step.sortFilter.desc": "Sort tasks by priority, status, due date, title, or creation date. Filter between all, active, or completed tasks.",
    "guide.next": "Next",
    "guide.back": "Back",
    "guide.skip": "Skip",
    "guide.done": "Done",
    "guide.stepOf": "of",
    "guide.restart": "Restart UI guide",
    "guide.step.search.title": "Search",
    "guide.step.search.desc": "Quickly find tasks by name. Press Tab from the search field to jump to the task input.",
    "sb.total": "total",
    "sb.active": "active",
    "sb.doneToday": "done",
    "sb.overdue": "overdue",
    "sb.clockFormat": "Clock format",
    "bulk.today": "Today",
    "settings.general.newTaskActiveToday": "New tasks active today",
    "backup.title": "Database Backups",
    "backup.desc": "Backups are created automatically before database schema upgrades. You can restore a backup to revert to a previous state.",
    "backup.empty": "No backups available",
    "backup.schema": "Schema v",
    "backup.restore": "Restore",
    "backup.confirmRestore": "Restore this backup? Current data will be replaced.",
    "backup.create": "Create backup now",
    "backup.created": "Backup created",
    "db.switched.title": "Database switched",
    "db.switched.desc": "You are now working with a different database file.",
  },
  ru: {
    "status.inbox": "Входящие", "status.active": "Активные",
    "status.done": "Готово",    "status.cancelled": "Отменено",
    "priority.1": "Срочный", "priority.2": "Высокий", "priority.3": "Средний", "priority.4": "Низкий",
    "sort.priority": "Приоритет", "sort.status": "Статус", "sort.due": "Срок",
    "sort.title": "Название", "sort.createdAt": "Создано", "sort.label": "Сортировка:",
    "qe.placeholder": "Новая задача... (@список #тег !приоритет ^дата >>flow ~зависимость *повтор /персона)",
    "bulk.selected": "выделено", "bulk.complete": "Выполнить",
    "bulk.cycle": "Цикл статуса", "bulk.shift": "+1 день", "bulk.delete": "Удалить",
    "filter.label": "Фильтр:", "filter.all": "Все",
    "cf.label": "Показать:", "cf.all": "Все", "cf.active": "Активные", "cf.done": "Завершённые",
    "sidebar.agenda": "Расписание",
    "agenda.today": "Сегодня",  "agenda.tomorrow": "Завтра",
    "agenda.week": "Неделя",    "agenda.month": "Месяц",
    "agenda.overdue": "Просрочено",
    "sidebar.status": "Статус", "sidebar.lists": "Списки",
    "sidebar.tags": "Теги",    "sidebar.personas": "Персонажи",
    "sidebar.hotkeys": "Горячие клавиши",
    "sidebar.collapseAll": "Свернуть все", "sidebar.expandAll": "Развернуть все",
    "hk.newTask": "Новая задача",           "hk.cursor": "Курсор + одиночный выбор",
    "hk.extend": "Расширить выделение",     "hk.selectAll": "Выделить все",
    "hk.complete": "Выполнить",             "hk.cycle": "Цикл статуса",
    "hk.delete": "Удалить",                 "hk.priority": "Установить приоритет",
    "hk.postpone": "Отложить дедлайн +1 день", "hk.undo": "Отменить действие",
    "hk.escape": "Снять выделение / сброс",
    "hk.homeEnd": "В начало / в конец списка",
    "detail.empty": "Выберите задачу\nдля просмотра свойств",
    "detail.tasksSelected": "задач выделено",
    "detail.task": "Задача",     "detail.status": "Статус",
    "detail.priority": "Приоритет", "detail.list": "Список",
    "detail.tags": "Теги",       "detail.personas": "Персонажи",
    "detail.due": "Дедлайн",
    "detail.recurrence": "Повторение", "detail.flow": "Task Flow",
    "detail.dependsOn": "Зависит от", "detail.created": "Создана",
    "detail.url": "URL", "detail.dateStart": "Дата начала",
    "detail.estimate": "Оценка", "detail.postponed": "Отложено раз",
    "detail.completedAt": "Завершена",
    "detail.notes": "Заметки",
    "note.add": "Добавить заметку", "note.edit": "Изменить", "note.delete": "Удалить",
    "note.title": "Заголовок (необязательно)", "note.content": "Содержимое",
    "note.save": "Сохранить", "note.cancel": "Отмена", "note.dblclick": "Двойной клик — редактировать",
    // edit
    "edit.title": "Редактировать задачу", "edit.save": "Сохранить", "edit.hint": "Двойной клик по задаче — открыть редактор",
    "edit.field.title": "Название", "edit.field.status": "Статус",
    "edit.field.priority": "Приоритет", "edit.field.list": "Список",
    "edit.field.tags": "Теги", "edit.field.personas": "Персонажи",
    "edit.field.due": "Дедлайн",
    "edit.field.dateStart": "Дата начала", "edit.field.recurrence": "Повторение",
    "edit.field.url": "URL", "edit.field.estimate": "Оценка",
    "edit.field.flow": "Task Flow", "edit.field.dependsOn": "Зависит от",
    "edit.addTag": "Добавить тег…", "edit.addPersona": "Добавить персонаж…",
    "edit.newList": "Новый список…",
    // rtm import
    "rtm.importBtn": "Импорт из RTM",
    "rtm.dialogTitle": "Импорт из Remember The Milk",
    "rtm.tasks": "Задачи",  "rtm.active": "активных",  "rtm.completed": "завершённых",
    "rtm.lists": "Списки",  "rtm.tags": "Теги",        "rtm.notes": "Заметки",
    "rtm.includeCompleted": "Импортировать завершённые и отменённые",
    "rtm.skippedTitle": "Будет пропущено:",
    "rtm.skipLocations": "геолокации (не поддерживаются)",
    "rtm.skipSmartLists": "смарт-листы (не поддерживаются)",
    "rtm.skipSubtasks": "связи подзадач",
    "rtm.skipSource": "источник создания задач",
    "rtm.importedToast": "Импортировано",
    "rtm.doImport": "Импортировать",
    "rtm.records": "записей",
    "rtm.importing": "Импортируется…",
    "rtm.importProgressOf": "из",
    "rtm.importTasks": "задач",
    "rtm.importPleaseWait": "Пожалуйста, подождите. Не закрывайте приложение",
    "cal.clearFilter": "Сбросить фильтр",
    "cal.month.0": "Январь",  "cal.month.1": "Февраль", "cal.month.2": "Март",
    "cal.month.3": "Апрель",  "cal.month.4": "Май",     "cal.month.5": "Июнь",
    "cal.month.6": "Июль",    "cal.month.7": "Август",  "cal.month.8": "Сентябрь",
    "cal.month.9": "Октябрь", "cal.month.10": "Ноябрь", "cal.month.11": "Декабрь",
    "cal.day.0": "Пн", "cal.day.1": "Вт", "cal.day.2": "Ср", "cal.day.3": "Чт",
    "cal.day.4": "Пт", "cal.day.5": "Сб", "cal.day.6": "Вс",
    "task.blocked": "блокирована", "task.dependsOn": "Зависит от:",
    "statusbadge.title": "Клик — следующий статус",
    "hdr.search": "Поиск задач...",
    "hdr.found": "найдено", "hdr.tasks": "задач", "hdr.completed": "выполнено",
    "hdr.hideLeft": "Скрыть левую панель",   "hdr.showLeft": "Показать левую панель",
    "hdr.hideCal": "Скрыть календарь",       "hdr.showCal": "Показать календарь",
    "hdr.hideRight": "Скрыть правую панель", "hdr.showRight": "Показать правую панель",
    "hdr.condense": "Компактный режим", "hdr.expand": "Обычный режим",
    "confirm.yes": "Да", "confirm.cancel": "Отмена",
    "toast.undone": "Действие отменено",
    "toast.noNumericDue": "Нет задач с числовым дедлайном",
    "toast.deleted": "Удалено",
    "empty.msg": "Нет задач. Добавьте первую через Quick Entry!",
    "empty.msgBefore": "Нет задач. Добавьте первую через Quick Entry или ",
    "empty.msgLink":   "заполните демо-данными",
    "empty.msgAfter":  "!",
    "empty.filtered":  "Ни одна задача не соответствует текущему фильтру.",
    "demo.title":   "Заполнить тестовыми данными?",
    "demo.desc":    "Будут добавлены 50 демо-задач, демонстрирующих все возможности приложения: все статусы и приоритеты, списки, теги, персонажи, повторяющиеся задачи, потоки, зависимости, ссылки, оценки, заметки и многое другое.",
    "demo.confirm": "Заполнить",
    "demo.cancel":  "Отмена",
    "footer.theme.auto": "Авто", "footer.theme.dark": "Тёмная", "footer.theme.light": "Светлая",
    "footer.settings": "Настройки",
    "footer.dateLocale": "ru-RU",
    "footer.author": "автор Юрий Дайбов",
    // settings dialog
    "settings.title": "Настройки",
    "settings.tab.general": "Основные",
    "settings.tab.appearance": "Оформление",
    "settings.tab.ai": "ИИ-ассистент",
    "settings.tab.import": "Импорт",
    "settings.tab.export": "Экспорт",
    "settings.tab.about": "О программе",
    "settings.tab.danger": "Опасная зона",
    // general
    "settings.general.title": "Основные",
    "settings.general.language": "Язык интерфейса",
    "settings.general.firstDay": "Первый день недели",
    "settings.general.dateFormat": "Формат даты",
    "settings.general.firstDay.monday": "Понедельник",
    "settings.general.firstDay.sunday": "Воскресенье",
    "settings.general.dateFormat.iso": "ISO (2026-03-23)",
    "settings.general.dateFormat.dmy": "ДД-ММ-ГГГГ (23-03-2026)",
    "settings.general.dateFormat.short": "Краткий (23.03.2026)",
    "settings.general.dateFormat.us": "Американский (03/23/2026)",
    "settings.general.dateFormat.long": "Полный (23 марта 2026 г.)",
    // appearance
    "settings.appearance.title": "Оформление",
    "settings.appearance.theme": "Тема оформления",
    "settings.appearance.font": "Шрифт",
    "settings.appearance.fontSystem": "Системный по умолчанию",
    "settings.appearance.fontHint": "Введите название любого шрифта, установленного в системе, или выберите из подсказок.",
    "settings.appearance.fontReset": "Сбросить на системный",
    "settings.appearance.fontSize": "Размер шрифта",
    "settings.appearance.fontSize.normal": "Обычный",
    "settings.appearance.fontSize.bigger": "Крупнее",
    "settings.appearance.fontSize.biggest": "Очень крупный",
    "settings.appearance.condense": "Плотность строк",
    "settings.appearance.condense.off": "Обычная",
    "settings.appearance.condense.on": "Плотная",
    "settings.appearance.colorTheme": "Цветовая тема",
    "settings.appearance.colorTheme.default": "По умолчанию",
    "settings.appearance.colorTheme.gruvbox": "Material Gruvbox",
    // ai
    "settings.ai.title": "ИИ-ассистент",
    "settings.ai.comingSoon": "Интеграция с ИИ появится в ближайшее время. Следите за обновлениями.",
    // import
    "settings.import.title": "Импорт",
    "settings.import.rtm": "Импорт из Remember The Milk",
    "settings.import.rtmDesc": "Загрузите JSON-экспорт из RTM для импорта задач в Task Orchestrator.",
    "settings.import.rtmBtn": "Выбрать файл…",
    // export
    "settings.export.title": "Экспорт",
    "settings.export.csv": "Экспорт в CSV",
    "settings.export.csvDesc": "Скачайте все задачи в формате CSV. Выберите поля для экспорта.",
    "settings.export.fields": "Включаемые поля",
    "settings.export.csvBtn": "Экспортировать CSV",
    // about
    "settings.about.title": "О программе",
    "settings.about.version": "Версия",
    "settings.about.description": "Task Orchestrator — мощное приложение для личного управления задачами с поддержкой списков, тегов, персонажей, повторяющихся задач и многого другого.",
    // danger zone
    "settings.danger.title": "Опасная зона",
    "settings.danger.clearAll": "Очистить все задачи",
    "settings.danger.clearAllDesc": "Безвозвратно удалить все задачи из базы данных. Действие невозможно отменить.",
    "settings.danger.clearBtn": "Очистить всё",
    "settings.danger.confirm1": "Вы уверены? Это удалит ВСЕ задачи без возможности восстановления.",
    "settings.danger.confirm2": "Введите DELETE для подтверждения:",
    "settings.danger.confirmBtn": "Да, удалить всё",
    "settings.danger.cancelBtn": "Отмена",
    // context menu
    "ctx.open": "Открыть",
    "ctx.snooze1d": "Отложить на 1 день",
    "ctx.snooze1w": "Отложить на 1 неделю",
    "ctx.snooze1m": "Отложить на 1 месяц",
    "ctx.markDone": "Отметить выполненной",
    "ctx.markDoneMulti": "Отметить выполненными",
    "ctx.duplicate": "Дублировать",
    "ctx.delete": "Удалить",
    "ctx.deleteSelected": "Удалить выбранные",
    "ctx.setStatus": "Установить статус",
    "ctx.selectedCount": "Выбрано задач: {n}",
    // flow
    "flow.blocked": "Заблокирована",
    "flow.startNext": "Начать следующую",
    "flow.progress": "Прогресс",
    "flow.noDescription": "Нет описания",
    "flow.deadline": "Дедлайн",
    "flow.description": "Описание",
    "flow.color": "Цвет",
    "flow.editMeta": "Редактировать flow",
    "flow.deleteFlow": "Удалить flow",
    "flow.deleteConfirm": "Удалить flow «{name}»? Задачи потеряют привязку к flow.",
    "flow.activated": "Авто-активация: {names}",
    "flow.skippedBlocked": "Пропущено заблокированных: {n}",
    "flow.readyHint": "Готова к старту",
    // maintenance
    "group.overdue": "Просрочено",
    "settings.tab.maintenance": "Обслуживание",
    "settings.maintenance.title": "Обслуживание",
    "settings.maintenance.currentDb": "Текущая база данных",
    "settings.maintenance.copyPath": "Скопировать путь",
    "settings.maintenance.copied": "Скопировано!",
    "settings.maintenance.reveal": "Открыть в проводнике",
    "settings.maintenance.open.label": "Открыть другую базу",
    "settings.maintenance.open.desc": "Переключиться на существующий .db файл. Текущая база данных не изменится.",
    "settings.maintenance.open.btn": "Открыть…",
    "settings.maintenance.move.label": "Переместить базу данных",
    "settings.maintenance.move.desc": "Скопировать текущую базу в новую папку и переключиться на неё. Исходный файл будет удалён.",
    "settings.maintenance.move.btn": "Переместить в…",
    "guide.step.sidebar.title": "Боковая панель",
    "guide.step.sidebar.desc": "Навигация по задачам: расписание, статусы, списки, теги, персоны и потоки задач. Нажмите на элемент, чтобы отфильтровать список.",
    "guide.step.createTask.title": "Создание задачи",
    "guide.step.createTask.desc": "Введите название задачи и нажмите Enter. Шорткаты: @список, #тег, !приоритет, ^дата, >>flow, ~зависимость, *повтор, /персона.",
    "guide.step.taskRow.title": "Строка задачи",
    "guide.step.taskRow.desc": "Клик — выделить, правый клик — контекстное меню (отложить, дублировать, удалить). Клик по иконке статуса — переключить статус.",
    "guide.step.detailPanel.title": "Панель деталей",
    "guide.step.detailPanel.desc": "Просмотр и редактирование свойств задачи: статус, приоритет, список, теги, дедлайн, заметки и другое.",
    "guide.step.sortFilter.title": "Сортировка и фильтр",
    "guide.step.sortFilter.desc": "Сортируйте задачи по приоритету, статусу, дедлайну, названию или дате создания. Переключайтесь между всеми, активными и завершёнными.",
    "guide.next": "Далее",
    "guide.back": "Назад",
    "guide.skip": "Пропустить",
    "guide.done": "Готово",
    "guide.stepOf": "из",
    "guide.restart": "Перезапустить обучение",
    "guide.step.search.title": "Поиск",
    "guide.step.search.desc": "Быстрый поиск задач по названию. Нажмите Tab, чтобы перейти к полю ввода задачи.",
    "sb.total": "всего",
    "sb.active": "активных",
    "sb.doneToday": "сделано",
    "sb.overdue": "просрочено",
    "sb.clockFormat": "Формат часов",
    "bulk.today": "На сегодня",
    "settings.general.newTaskActiveToday": "Новые задачи сразу на сегодня",
    "backup.title": "Резервные копии базы данных",
    "backup.desc": "Резервные копии создаются автоматически перед обновлением схемы базы данных. Вы можете восстановить копию, чтобы вернуться к предыдущему состоянию.",
    "backup.empty": "Нет доступных резервных копий",
    "backup.schema": "Схема v",
    "backup.restore": "Восстановить",
    "backup.confirmRestore": "Восстановить эту копию? Текущие данные будут заменены.",
    "backup.create": "Создать копию",
    "backup.created": "Копия создана",
    "db.switched.title": "База данных переключена",
    "db.switched.desc": "Вы работаете с другим файлом базы данных.",
  },
};

// ─── App Context ──────────────────────────────────────────────────────────────

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ─── Mock Data (English) ──────────────────────────────────────────────────────

const MOCK_LISTS    = ["Home", "Work", "Studies", "Shopping", "Health"];
const MOCK_TAGS     = ["shopping", "urgent", "meeting", "code", "call", "reading", "sport"];
const MOCK_FLOWS    = ["ShoppingTrip", "ProductRelease", "MorningRoutine"];
const MOCK_PERSONAS = ["Alice", "Bob", "Charlie"];

let nextId = 100;
const uid = () => String(nextId++);

function shiftDue(due) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const d = new Date(due + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const INITIAL_TASKS = [
  { id: "1",  title: "Buy milk",               list: "Shopping", tags: ["shopping"],          personas: [],          priority: 2, due: "2026-03-23", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: "3",  subtasks: [], status: "active", createdAt: "2026-03-20T10:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "2",  title: "Call the doctor",         list: "Health",   tags: ["call", "urgent"],   personas: ["Alice"],   priority: 1, due: "2026-03-22", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-21T08:00:00Z", url: null, dateStart: null, estimate: "30 min", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "3",  title: "Check shopping list",     list: "Shopping", tags: ["shopping"],          personas: [],          priority: 3, due: "2026-03-23", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-19T14:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "4",  title: "Write weekly report",     list: "Work",     tags: ["code"],              personas: ["Bob"],     priority: 2, due: "2026-03-24", recurrence: "weekly",flowId: "ProductRelease", dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-18T09:00:00Z", url: "https://docs.example.com/report", dateStart: null, estimate: "2 hours", postponed: 1, notes: [{ id: "n1", title: "Template", content: "Use the Q1 template from shared drive", createdAt: "2026-03-18T09:30:00Z" }], rtmSeriesId: null },
  { id: "5",  title: "Morning workout",         list: "Health",   tags: ["sport"],             personas: [],          priority: 3, due: null,         recurrence: "daily", flowId: "MorningRoutine", dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-20T06:00:00Z", url: null, dateStart: null, estimate: "45 min", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "6",  title: "Read a book chapter",     list: "Studies",  tags: ["reading"],           personas: [],          priority: 4, due: "2026-03-25", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-21T20:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "7",  title: "Prepare presentation",    list: "Work",     tags: ["meeting"],           personas: ["Alice","Bob"], priority: 1, due: "2026-03-23", recurrence: null, flowId: "ProductRelease", dependsOn: "4",  subtasks: [], status: "active", createdAt: "2026-03-17T11:00:00Z", url: null, dateStart: "2026-03-22", estimate: "3 hours", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "8",  title: "Clean windows",           list: "Home",     tags: [],                    personas: [],          priority: 4, due: "2026-03-28", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-22T10:00:00Z", url: null, dateStart: null, estimate: null, postponed: 2, notes: [], rtmSeriesId: null },
  { id: "9",  title: "Do code review",          list: "Work",     tags: ["code"],              personas: ["Charlie"], priority: 2, due: "2026-03-22", recurrence: null,    flowId: "ProductRelease", dependsOn: "7",  subtasks: [], status: "inbox",  createdAt: "2026-03-21T15:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "10", title: "Buy vitamins",            list: "Shopping", tags: ["shopping","urgent"], personas: [],          priority: 2, due: "2026-03-22", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: "1",  subtasks: [], status: "active", createdAt: "2026-03-21T12:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
];

// ─── Demo data generator ──────────────────────────────────────────────────────

function buildDemoTasks() {
  const rel = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const now = () => new Date().toISOString();
  // Generate unique IDs for demo tasks; memoized so dependsOn references work
  const _idMap = {};
  const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rndChar = () => ENC[(Math.random() * 32) | 0];
  const id = (n) => { if (!_idMap[n]) { let s = ''; for (let i = 0; i < 26; i++) s += rndChar(); _idMap[n] = s; } return _idMap[n]; };

  const lists    = ['Work', 'Personal', 'Health', 'Learning', 'Finance', 'Side Project', 'Home'];
  const tags     = ['meeting', 'code', 'design', 'call', 'email', 'urgent', 'review',
                    'planning', 'research', 'fitness', 'reading', 'budget', 'travel', 'home', 'bug'];
  const flows    = ['ProductLaunch', 'WeeklyWellness', 'HomeRenovation'];
  const personas = ['Alice', 'Bob', 'Charlie', 'Diana'];

  const t = (n, title, list, status, priority, due, opts = {}) => ({
    id: id(n), title, list, status, priority, due,
    dateStart: null, estimate: null, recurrence: null,
    flowId: null, dependsOn: null, tags: [], personas: [],
    url: null, postponed: 0, subtasks: [], notes: [], rtmSeriesId: null,
    createdAt: now(),
    completedAt: status === 'done' ? (due ? `${due}T12:00:00.000Z` : now()) : null,
    ...opts,
  });

  const tasks = [
    // ── Work ────────────────────────────────────────────────────────────────
    t(1,  'Prepare Q2 roadmap presentation',    'Work', 'active',    1, rel(3),  { estimate: '3 hours',   tags: ['meeting','planning'],   personas: ['Alice'],           flowId: 'ProductLaunch', dateStart: rel(0), rtmSeriesId: id(1), notes: [{ id: ulid(), title: 'Key slides', content: 'Include: user growth, revenue trends, Q3 goals, technical roadmap, hiring plan', createdAt: now() }] }),
    t(2,  'Fix critical login bug',             'Work', 'active',    1, rel(1),  { estimate: '2 hours',   tags: ['code','bug','urgent'],   personas: ['Bob'],             flowId: 'ProductLaunch', postponed: 1,      url: 'https://github.com/example/issues/42' }),
    t(3,  'Code review for PR #128',            'Work', 'inbox',     2, rel(2),  { estimate: '1 hour',    tags: ['code','review'],         personas: ['Charlie'],         flowId: 'ProductLaunch', dependsOn: id(2),  url: 'https://github.com/example/pulls/128' }),
    t(4,  'Weekly team standup',                'Work', 'active',    3, rel(1),  { estimate: '30 min',    tags: ['meeting'],               personas: ['Alice','Bob','Charlie'], recurrence: 'weekly' }),
    t(5,  'Write API documentation',            'Work', 'active',    2, rel(5),  { estimate: '4 hours',   tags: ['code','planning'],                                      rtmSeriesId: id(5), notes: [{ id: ulid(), title: 'Endpoints to document', content: 'Auth, Users, Tasks, Reports, Webhooks', createdAt: now() }], url: 'https://swagger.io/docs/specification/' }),
    t(6,  'Design new user onboarding flow',    'Work', 'inbox',     2, rel(7),  { estimate: '5 hours',   tags: ['design','planning'],     personas: ['Diana'],           flowId: 'ProductLaunch', dateStart: rel(2) }),
    t(7,  'Performance review 1-on-1',          'Work', 'active',    1, rel(4),  { estimate: '1 hour',    tags: ['meeting'],               personas: ['Alice'] }),
    t(8,  'Update project dependencies',        'Work', 'done',      3, rel(-3), { estimate: '1 hour',    tags: ['code'] }),
    t(9,  'Set up error monitoring',            'Work', 'active',    2, rel(6),  { estimate: '2 hours',   tags: ['code'],                  personas: ['Bob'],             flowId: 'ProductLaunch', dependsOn: id(3),  url: 'https://sentry.io', dateStart: rel(1) }),
    t(10, 'Conduct 5 user research interviews', 'Work', 'inbox',     2, rel(10), { estimate: '5 hours',   tags: ['research','meeting'],    personas: ['Diana'],           flowId: 'ProductLaunch', dependsOn: id(6), dateStart: rel(3), rtmSeriesId: id(10), notes: [{ id: ulid(), title: 'Interview script', content: 'Q1: Walk me through your typical day\nQ2: What are the biggest pain points?\nQ3: How do you currently solve this?', createdAt: now() }] }),

    // ── Personal ────────────────────────────────────────────────────────────
    t(11, 'Plan summer vacation',               'Personal', 'inbox',  3, rel(30), { estimate: '2 hours', tags: ['travel','planning'],                                    url: 'https://google.com/flights' }),
    t(12, 'Call dentist for appointment',       'Personal', 'inbox',  2, rel(2),  {                      tags: ['call'],                                                  postponed: 3 }),
    t(13, 'Grocery shopping',                   'Personal', 'active', 3, rel(1),  { estimate: '1 hour',  tags: ['home'],                                                  recurrence: 'weekly' }),
    t(14, 'Call parents',                       'Personal', 'active', 2, rel(3),  { estimate: '30 min',  tags: ['call'],                                                  recurrence: 'weekly', postponed: 1 }),
    t(15, 'Fix leaky bathroom faucet',          'Home',     'inbox',  2, rel(5),  {                      tags: ['home'],                  flowId: 'HomeRenovation',        url: 'https://youtube.com/results?search_query=fix+leaky+faucet' }),
    t(16, 'Organize home office',               'Home',     'inbox',  4, null,    { estimate: '3 hours', tags: ['home'],                                                  postponed: 2 }),
    t(17, 'Renew car insurance',                'Personal', 'inbox',  1, rel(14), {                      tags: ['email','budget'] }),

    // ── Health & Fitness ─────────────────────────────────────────────────────
    t(18, 'Morning run',                        'Health',   'active', 3, rel(1),  { estimate: '45 min',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily' }),
    t(19, 'Weekly yoga class',                  'Health',   'active', 3, rel(3),  { estimate: '1 hour',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'weekly', url: 'https://yoga-studio.example.com' }),
    t(20, 'Meal prep for the week',             'Health',   'active', 3, rel(2),  { estimate: '2 hours', tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'weekly', rtmSeriesId: id(20), notes: [{ id: ulid(), title: 'This week menu', content: 'Mon: chicken & rice\nTue: pasta primavera\nWed: salad bowl\nThu: stir fry\nFri: leftovers', createdAt: now() }] }),
    t(21, 'Take daily vitamins',                'Health',   'active', 4, rel(1),  {                      tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily' }),
    t(22, 'Monthly health checkup',             'Health',   'inbox',  2, rel(21), { estimate: '2 hours', tags: ['fitness'],                                               recurrence: 'monthly', postponed: 1 }),
    t(23, '30-minute strength workout',         'Health',   'active', 2, rel(1),  { estimate: '30 min',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily',  url: 'https://fitness-app.example.com/workout' }),

    // ── Learning ─────────────────────────────────────────────────────────────
    t(24, "Read 'Clean Code' chapter 5",        'Learning', 'active', 3, rel(3),  { estimate: '1 hour',   tags: ['reading','code'] }),
    t(25, 'Complete Rust ownership tutorial',   'Learning', 'inbox',  3, rel(7),  { estimate: '2 hours',  tags: ['code','reading'],                                       url: 'https://doc.rust-lang.org/book/ch04.html' }),
    t(26, 'Watch system design talk',           'Learning', 'inbox',  4, null,    { estimate: '1.5 hours',tags: ['research'],                                              url: 'https://youtube.com/watch?v=system-design' }),
    t(27, 'Practice SQL window functions',      'Learning', 'inbox',  3, rel(10), { estimate: '1.5 hours',tags: ['code'],                                                  url: 'https://sqlzoo.net/wiki/Window_functions' }),
    t(28, 'Write blog post: React perf tips',   'Learning', 'active', 2, rel(12), { estimate: '3 hours',  tags: ['code','planning'],      dateStart: rel(5),               rtmSeriesId: id(28), notes: [{ id: ulid(), title: 'Outline', content: '1. useMemo and useCallback\n2. Code splitting\n3. Virtual lists\n4. Image optimization\n5. Bundle analysis', createdAt: now() }] }),
    t(29, 'Monthly learning retrospective',     'Learning', 'inbox',  3, rel(25), { estimate: '1 hour',   tags: ['planning','research'],  recurrence: 'monthly' }),

    // ── Finance ───────────────────────────────────────────────────────────────
    t(30, 'Review monthly budget',              'Finance',  'active', 2, rel(7),  { estimate: '1 hour',   tags: ['budget'],               recurrence: 'monthly' }),
    t(31, 'File quarterly taxes',               'Finance',  'inbox',  1, rel(21), { estimate: '3 hours',  tags: ['urgent','budget'],      dateStart: rel(14),              rtmSeriesId: id(31), notes: [{ id: ulid(), title: 'Documents checklist', content: '☐ W-2 / 1099 forms\n☐ Last year\'s return\n☐ Mortgage interest statement\n☐ Charitable donation receipts\n☐ Medical expense records', createdAt: now() }] }),
    t(32, 'Negotiate cable/internet bill',      'Finance',  'inbox',  3, rel(5),  {                       tags: ['call','budget'],         postponed: 2 }),
    t(33, 'Monthly transfer to savings',        'Finance',  'active', 2, rel(7),  {                       tags: ['budget'],               recurrence: 'monthly' }),
    t(34, 'Review investment portfolio',        'Finance',  'inbox',  3, rel(14), { estimate: '1 hour',   tags: ['budget','research'],    url: 'https://finance.yahoo.com/portfolio' }),

    // ── Side Project ──────────────────────────────────────────────────────────
    t(35, 'Set up CI/CD pipeline',              'Side Project', 'active', 2, rel(4),  { estimate: '3 hours', tags: ['code'],            personas: ['Bob'],    flowId: 'ProductLaunch', url: 'https://github.com/features/actions' }),
    t(36, 'Write unit tests for auth module',   'Side Project', 'inbox',  2, rel(6),  { estimate: '2 hours', tags: ['code','review'],                         flowId: 'ProductLaunch', dependsOn: id(35) }),
    t(37, 'Design landing page',                'Side Project', 'active', 2, rel(8),  { estimate: '5 hours', tags: ['design'],          personas: ['Diana'],  flowId: 'ProductLaunch' }),
    t(38, 'Integrate analytics',                'Side Project', 'inbox',  3, rel(9),  { estimate: '2 hours', tags: ['code'],                                  flowId: 'ProductLaunch', dependsOn: id(35), dateStart: rel(5), url: 'https://analytics.google.com' }),
    t(39, 'Public beta launch',                 'Side Project', 'inbox',  1, rel(21), {                      tags: ['planning','urgent'], personas: ['Alice','Bob'], flowId: 'ProductLaunch', dependsOn: id(36), dateStart: rel(15) }),

    // ── Home Renovation (flow) ────────────────────────────────────────────────
    t(40, 'Get 3 quotes for bathroom reno',     'Home', 'inbox',  2, rel(7),  {                      tags: ['home','research'],   personas: ['Charlie'],   flowId: 'HomeRenovation' }),
    t(41, 'Choose tiles and fixtures',          'Home', 'inbox',  2, rel(14), { estimate: '3 hours', tags: ['design','home'],                              flowId: 'HomeRenovation', dependsOn: id(40), dateStart: rel(7),  url: 'https://houzz.com' }),
    t(42, 'Sign contract with contractor',      'Home', 'inbox',  1, rel(21), {                      tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: id(41), dateStart: rel(14) }),
    t(43, 'Manage renovation timeline',         'Home', 'inbox',  2, rel(45), {                      tags: ['planning','home'],                            flowId: 'HomeRenovation', dependsOn: id(42), dateStart: rel(30) }),
    t(44, 'Final walkthrough and sign-off',     'Home', 'inbox',  2, rel(60), { estimate: '1 hour',  tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: id(43), dateStart: rel(58) }),

    // ── Done ─────────────────────────────────────────────────────────────────
    t(45, 'Set up new development laptop',      'Work',     'done',      3, rel(-7),  { estimate: '4 hours', tags: ['code'] }),
    t(46, 'Book flight for conference',         'Personal', 'done',      2, rel(-14), {                      tags: ['travel','email'],                               url: 'https://flights.google.com' }),
    t(47, 'Create project proposal document',   'Work',     'done',      1, rel(-5),  { estimate: '2 hours', tags: ['planning'],      personas: ['Alice'] }),
    t(48, 'Read Q4 annual report',              'Finance',  'done',      3, rel(-10), { estimate: '1 hour',  tags: ['reading','budget'] }),

    // ── Cancelled ─────────────────────────────────────────────────────────────
    t(49, 'Migrate monolith to microservices',  'Work',     'cancelled', 2, rel(-30), { estimate: '40 hours', tags: ['code','planning'], personas: ['Bob','Charlie'], rtmSeriesId: id(49), notes: [{ id: ulid(), title: 'Cancellation reason', content: 'Scope too large for current team. Will revisit in Q4 with dedicated resources.', createdAt: now() }] }),
    t(50, 'Launch podcast series',              'Personal', 'cancelled', 4, null,     {                       tags: ['planning'],         postponed: 5 }),
  ];

  return { tasks, lists, tags, flows, personas };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function taskReducer(state, action) {
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
        notesBySeries[n.series_id].push({ id: n.id, title: n.title || "", content: n.content || "", createdAt: new Date(n.date_created).toISOString() });
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

// ─── Shorthand Parser ─────────────────────────────────────────────────────────

function parseShorthand(input) {
  const result = { title: "", list: null, tags: [], personas: [], priority: null, due: null, recurrence: null, flowId: null, dependsOn: null, tokens: [] };
  const titleParts = [];
  for (const p of input.split(/\s+/).filter(Boolean)) {
    if      (p.startsWith(">>"))      { result.flowId = p.slice(2);           result.tokens.push({ type: "flow",       value: p }); }
    else if (p.startsWith("@"))       { result.list = p.slice(1);             result.tokens.push({ type: "list",       value: p }); }
    else if (p.startsWith("#"))       { result.tags.push(p.slice(1));         result.tokens.push({ type: "tag",        value: p }); }
    else if (/^![1-4]$/.test(p))     { result.priority = parseInt(p[1]);     result.tokens.push({ type: "priority",   value: p }); }
    else if (p.startsWith("^"))       { const pd = parseDateInput(p.slice(1)); if (pd) { result.due = pd; result.tokens.push({ type: "due", value: p }); } else { titleParts.push(p); result.tokens.push({ type: "text", value: p }); } }
    else if (p.startsWith("~"))       { result.dependsOn = p.slice(1);        result.tokens.push({ type: "depends",    value: p }); }
    else if (p.startsWith("*"))       { result.recurrence = p.slice(1);       result.tokens.push({ type: "recurrence", value: p }); }
    else if (p.startsWith("/")  && p.length > 1) { result.personas.push(p.slice(1)); result.tokens.push({ type: "persona", value: p }); }
    else                              { titleParts.push(p);                   result.tokens.push({ type: "text",       value: p }); }
  }
  result.title = titleParts.join(" ");
  return result;
}

// ─── Overdue level helper ─────────────────────────────────────────────────────

const OVERDUE_DATE_CLS = { today: "text-yellow-400", overdue: "text-orange-400", late: "text-red-400" };
const OVERDUE_STRIPE   = { today: "rgba(234,179,8,.75)", overdue: "rgba(251,146,60,.8)", late: "rgba(239,68,68,.85)" };
const OVERDUE_BG       = { today: "rgba(234,179,8,.04)", overdue: "rgba(251,146,60,.05)", late: "rgba(239,68,68,.07)" };

function overdueLevel(task) {
  if (!task.due || task.status === "done" || task.status === "cancelled") return null;
  const today = new Date().toISOString().slice(0, 10);
  if (task.due < today) return "late";
  return null;
}

const CHIP_STYLE = {
  text:       { background: "transparent",           color: "#f3f4f6", border: "none",                             padding: "2px 0"    },
  list:       { background: "rgba(52,211,153,.18)",  color: "#34d399", border: "1px solid rgba(52,211,153,.45)",  padding: "2px 8px", borderRadius: 12 },
  tag:        { background: "rgba(56,189,248,.18)",  color: "#38bdf8", border: "1px solid rgba(56,189,248,.45)",  padding: "2px 8px", borderRadius: 12 },
  priority:   { background: "rgba(251,146,60,.18)",  color: "#fb923c", border: "1px solid rgba(251,146,60,.45)",  padding: "2px 8px", borderRadius: 12 },
  due:        { background: "rgba(192,132,252,.18)", color: "#c084fc", border: "1px solid rgba(192,132,252,.45)", padding: "2px 8px", borderRadius: 12 },
  flow:       { background: "rgba(244,114,182,.18)", color: "#f472b6", border: "1px solid rgba(244,114,182,.45)", padding: "2px 8px", borderRadius: 12 },
  depends:    { background: "rgba(250,204,21,.18)",  color: "#facc15", border: "1px solid rgba(250,204,21,.45)",  padding: "2px 8px", borderRadius: 12 },
  recurrence: { background: "rgba(45,212,191,.18)",  color: "#2dd4bf", border: "1px solid rgba(45,212,191,.45)",  padding: "2px 8px", borderRadius: 12 },
  persona:    { background: "rgba(129,140,248,.18)", color: "#818cf8", border: "1px solid rgba(129,140,248,.45)", padding: "2px 8px", borderRadius: 12 },
};

function getSuggestions(input, { lists = [], tags = [], flows = [], personas = [], priorityLabels = {}, hasListChip = false } = {}) {
  const words = input.split(/\s+/);
  const last = words[words.length - 1] || "";
  if (!last) return [];
  if (last.startsWith(">>")) { const q = last.slice(2).toLowerCase(); return flows.filter(f => f.toLowerCase().includes(q)).map(f => ({ type: "flow",       label: `>>${f}`, replace: `>>${f}` })); }
  if (last.startsWith("@"))  { if (hasListChip) return []; const q = last.slice(1).toLowerCase(); return lists.filter(l => l.toLowerCase().includes(q)).map(l => ({ type: "list", label: `@${l}`, replace: `@${l}` })); }
  if (last.startsWith("#"))  { const q = last.slice(1).toLowerCase(); return tags.filter(t  => t.toLowerCase().includes(q)).map(t => ({ type: "tag",        label: `#${t}`,  replace: `#${t}` })); }
  if (last.startsWith("/")  && personas.length > 0) { const q = last.slice(1).toLowerCase(); return personas.filter(p => p.toLowerCase().includes(q)).map(p => ({ type: "persona", label: `/${p}`, replace: `/${p}` })); }
  if (last.startsWith("!"))  return ["!1","!2","!3","!4"].filter(s => s.startsWith(last)).map(s => ({ type: "priority", label: s, replace: s, desc: priorityLabels[s[1]] }));
  if (last.startsWith("^"))  return ["^today","^tomorrow","^mon","^tue","^fri"].filter(s => s.startsWith(last)).map(s => ({ type: "due",        label: s, replace: s }));
  if (last.startsWith("*"))  return ["*daily","*weekly","*monthly"].filter(s => s.startsWith(last)).map(s => ({ type: "recurrence", label: s, replace: s }));
  return [];
}

// Returns the token type for a single word, or null if it's plain text.
function getTokenType(word) {
  if (!word) return null;
  if (word.startsWith(">>") && word.length > 2) return "flow";
  if (word.startsWith("@")  && word.length > 1) return "list";
  if (word.startsWith("#")  && word.length > 1) return "tag";
  if (/^![1-4]$/.test(word))                   return "priority";
  if (word.startsWith("^")  && word.length > 1) return "due";
  if (word.startsWith("~")  && word.length > 1) return "depends";
  if (word.startsWith("*")  && word.length > 1) return "recurrence";
  if (word.startsWith("/")  && word.length > 1) return "persona";
  return null;
}

// Tries to commit the last word of `text` as a token.
// Returns { tokenType, raw, newText } or null.
function tryCommitToken(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const last = words[words.length - 1];
  const tokenType = getTokenType(last);
  if (!tokenType) return null;
  return { tokenType, raw: last, newText: words.slice(0, -1).join(" ") };
}

// Extracts parsed task data from an array of committed chip objects.
function buildFromChips(chips) {
  const r = { list: null, tags: [], personas: [], priority: null, due: null, recurrence: null, flowId: null, dependsOn: null };
  for (const c of chips) {
    switch (c.type) {
      case "list":       r.list       = c.raw.slice(1);  break;
      case "tag":        r.tags.push(c.raw.slice(1));    break;
      case "persona":    r.personas.push(c.raw.slice(1)); break;
      case "priority":   r.priority   = parseInt(c.raw[1]); break;
      case "due":        r.due        = parseDateInput(c.raw.slice(1)) || null;  break;
      case "recurrence": r.recurrence = c.raw.slice(1);  break;
      case "flow":       r.flowId     = c.raw.slice(2);  break;
      case "depends":    r.dependsOn  = c.raw.slice(1);  break;
    }
  }
  return r;
}

// ─── TokenChip ────────────────────────────────────────────────────────────────

function TokenChip({ token }) {
  const s = CHIP_STYLE[token.type] || CHIP_STYLE.text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 500, fontFamily: "monospace", whiteSpace: "nowrap", ...s }}>
      {token.value}
    </span>
  );
}

// Committed chip pill rendered inside the input field.
function ChipPill({ chip, onRemove }) {
  const s = CHIP_STYLE[chip.type] || CHIP_STYLE.text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 500,
                   fontFamily: "monospace", whiteSpace: "nowrap", userSelect: "none", flexShrink: 0, ...s }}>
      {chip.raw}
      <button type="button" tabIndex={-1}
        onClick={e => { e.stopPropagation(); onRemove(); }}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 1px",
                 lineHeight: 1, opacity: 0.65, color: "inherit", fontSize: 13 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.65")}>
        ×
      </button>
    </span>
  );
}

// ─── QuickEntry ───────────────────────────────────────────────────────────────

function QuickEntry({ onAdd }) {
  const { t, TC, lists, tags, flows, personas } = useApp();
  // chips  — committed token pills shown inside the input field
  // inputText — the text currently being typed (title + any uncommitted token)
  const [chips,       setChips]       = useState([]);
  const [inputText,   setInputText]   = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugg, setSelectedSugg] = useState(0);
  const inputRef = useRef(null);

  const hasListChip = chips.some(c => c.type === "list");

  useEffect(() => {
    const priorityLabels = { "1": t("priority.1"), "2": t("priority.2"), "3": t("priority.3"), "4": t("priority.4") };
    setSuggestions(getSuggestions(inputText, { lists, tags, flows, personas, priorityLabels, hasListChip }));
    setSelectedSugg(0);
  }, [inputText, lists, tags, flows, personas, t, hasListChip]);

  // Commit a chip and update inputText accordingly.
  const commitToken = (tokenType, raw, remainingText) => {
    setChips(prev => [...prev, { type: tokenType, raw }]);
    setInputText(remainingText ? remainingText + " " : "");
  };

  // Apply an autocomplete suggestion: replace last word, then try to commit.
  const applySuggestion = (sugg) => {
    const words = inputText.split(/\s+/);
    words[words.length - 1] = sugg.replace;
    const joined = words.join(" ");
    const commit = tryCommitToken(joined);
    if (commit) {
      commitToken(commit.tokenType, commit.raw, commit.newText);
    } else {
      setInputText(joined + " ");
    }
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    // When a space is typed and the previous word is a recognisable token → commit it,
    // unless it's a list token and a list chip already exists (only one list allowed).
    if (val.endsWith(" ")) {
      const commit = tryCommitToken(val.trimEnd());
      if (commit && !(commit.tokenType === "list" && hasListChip)) {
        commitToken(commit.tokenType, commit.raw, commit.newText);
        return;
      }
    }
    setInputText(val);
  };

  const handleKeyDown = (e) => {
    // Backspace on empty text field → pop last chip back to text for editing.
    if (e.key === "Backspace" && inputText === "" && chips.length > 0) {
      e.preventDefault();
      const last = chips[chips.length - 1];
      setChips(prev => prev.slice(0, -1));
      setInputText(last.raw);
      return;
    }
    // Suggestion navigation.
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSugg(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedSugg(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        applySuggestion(suggestions[selectedSugg]);
        return;
      }
      if (e.key === "Enter" && inputText.split(/\s+/).pop()?.match(/^[@#!\/^*]|^>>/) ) {
        e.preventDefault();
        applySuggestion(suggestions[selectedSugg]);
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      document.getElementById(e.shiftKey ? "search-input" : "task-list")?.focus();
      return;
    }
    if (e.key === "Enter") {
      // Try to commit any pending token before submitting.
      // Skip if it's a list token and a list chip already exists.
      let title = inputText.trim();
      let allChips = chips;
      const commit = tryCommitToken(title);
      if (commit && !(commit.tokenType === "list" && hasListChip)) {
        allChips = [...chips, { type: commit.tokenType, raw: commit.raw }];
        title = commit.newText.trim();
      }
      if (!title) return; // title is required
      e.preventDefault();
      const d = buildFromChips(allChips);
      onAdd({ title, list: d.list || null, tags: d.tags,
              personas: d.personas,
              priority: d.priority || 4, due: d.due, recurrence: d.recurrence,
              flowId: d.flowId, dependsOn: d.dependsOn, status: "inbox" });
      setChips([]);
      setInputText("");
    }
    if (e.key === "Escape") setSuggestions([]);
  };

  const removeChip = (idx) => {
    setChips(prev => prev.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  const isEmpty = chips.length === 0 && !inputText;

  return (
    <div data-guide="create-task" className="relative">
      {/* Input row with inline chips */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 min-h-[44px] border rounded-lg px-4 py-2 cursor-text
          focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all ${TC.input}`}
      >
        <Plus size={18} className="text-gray-400 flex-shrink-0" />
        {chips.map((chip, idx) => (
          <ChipPill key={idx} chip={chip} onRemove={() => removeChip(idx)} />
        ))}
        <input
          ref={inputRef}
          id="quick-entry"
          autoComplete="off"
          value={inputText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isEmpty ? t("qe.placeholder") : ""}
          className={`flex-1 min-w-[8rem] bg-transparent outline-none text-sm font-mono ${TC.inputText}`}
        />
      </div>
      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div className={`absolute z-50 top-full mt-1 left-0 right-0 border rounded-lg shadow-xl overflow-hidden ${TC.surface} ${TC.borderClass}`}>
          {suggestions.map((s, i) => (
            <button key={s.label} onClick={() => applySuggestion(s)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${i === selectedSugg ? TC.elevated : TC.hoverBg}`}>
              <TokenChip token={{ type: s.type, value: s.label }} />
              {s.desc && <span className={`text-xs ${TC.textMuted}`}>{s.desc}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PriorityBadge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", background: PRIORITY_COLORS[priority], flexShrink: 0 }}>
      <Flag size={10} /> {priority}
    </span>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, onClick }) {
  const { t } = useApp();
  // Defensive: fall back to 'inbox' if status is not a known value (e.g. corrupted DB data)
  const safeStatus = STATUS_ICONS[status] ? status : "inbox";
  const Icon = STATUS_ICONS[safeStatus];
  const cls = {
    inbox:     "bg-gray-600/50 text-gray-200 border border-gray-500/40",
    active:    "bg-sky-600/20 text-sky-300 border border-sky-500/40",
    done:      "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40",
    cancelled: "bg-red-600/20 text-red-300 border border-red-500/40",
  }[safeStatus];
  return (
    <button onClick={onClick} title={t("statusbadge.title")}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 flex-shrink-0 ${cls}`}>
      <Icon size={12} /> {t("status." + safeStatus)}
    </button>
  );
}

// ─── ContextMenu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, task, selectedIds, onClose, onOpen, onSnooze, onAssignToday, onSetStatus, onMarkDone, onDuplicate, onDelete }) {
  const { t, TC } = useApp();
  const ref = useRef(null);
  const isMulti = selectedIds.size > 1 && selectedIds.has(task.id);
  const ids = isMulti ? selectedIds : new Set([task.id]);
  const n = ids.size;

  // Close on outside click, Escape, or scroll
  useEffect(() => {
    const onDown  = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey   = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    document.addEventListener("scroll",    onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
      document.removeEventListener("scroll",    onScroll, true);
    };
  }, [onClose]);

  // Clamp position so the menu doesn't overflow the viewport
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      left: x + rect.width  > vw ? Math.max(0, vw - rect.width  - 8) : x,
      top:  y + rect.height > vh ? Math.max(0, vh - rect.height - 8) : y,
    });
  }, [x, y]);

  const Sep = ({ id }) => <div key={id} className={`my-1 border-t ${TC.borderClass}`} />;

  const Item = ({ label, onClick: act, danger = false }) => (
    <button
      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors
        ${danger ? "text-red-400 hover:bg-red-500/10" : `${TC.text} hover:bg-sky-500/10`}`}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); act(); }}
    >
      {label}
    </button>
  );

  const [subOpen, setSubOpen] = useState(null);
  const subTimer = useRef(null);
  const SubMenu = ({ id, label, children }) => {
    const itemRef = useRef(null);
    const open = subOpen === id;
    return (
      <div ref={itemRef} className="relative"
        onMouseEnter={() => { clearTimeout(subTimer.current); setSubOpen(id); }}
        onMouseLeave={() => { subTimer.current = setTimeout(() => setSubOpen(null), 200); }}
      >
        <button className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors flex items-center justify-between ${TC.text} hover:bg-sky-500/10`}>
          {label} <ChevronRight size={12} className={TC.textMuted} />
        </button>
        {open && (
          <div className={`${TC.surface} border ${TC.borderClass} rounded-lg shadow-2xl py-1 px-1`}
            style={{ position: "absolute", left: "100%", top: 0, minWidth: 160, width: "fit-content", display: "inline-block" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={`${TC.surface} border ${TC.borderClass} rounded-lg shadow-2xl py-1 px-1`}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 999, minWidth: 200, maxWidth: 280, width: "fit-content", display: "inline-block" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isMulti && (
        <>
          <div className={`px-3 py-1.5 text-xs font-semibold tracking-wide ${TC.textMuted}`}>
            {t("ctx.selectedCount").replace("{n}", n)}
          </div>
          <Sep id="s0" />
        </>
      )}
      <SubMenu id="status" label={t("ctx.setStatus")}>
        {STATUSES.map(s => {
          const Icon = STATUS_ICONS[s];
          return (
            <button key={s}
              className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-2 ${TC.text} hover:bg-sky-500/10`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSetStatus(ids, s); }}>
              <Icon size={13} /> {t("status." + s)}
            </button>
          );
        })}
      </SubMenu>
      {!isMulti && <Item label={t("ctx.open")}      onClick={() => onOpen(task.id)} />}
      <Sep id="s1" />
      <Item label={t("bulk.today")}   onClick={() => onAssignToday(ids)} />
      <Item label={t("ctx.snooze1d")} onClick={() => onSnooze(ids, 1, 0)} />
      <Item label={t("ctx.snooze1w")} onClick={() => onSnooze(ids, 7, 0)} />
      <Item label={t("ctx.snooze1m")} onClick={() => onSnooze(ids, 0, 1)} />
      <Sep id="s2" />
      {!isMulti && <Item label={t("ctx.duplicate")} onClick={() => onDuplicate(task.id)} />}
      <Sep id="s3" />
      <Item label={isMulti ? t("ctx.deleteSelected") : t("ctx.delete")} onClick={() => onDelete(ids)} danger />
    </div>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({ task, isCursor, isSelected, isBlocked = false, onStatusCycle, onClick, onCheckboxClick, onDoubleClick, onContextMenu, compact = false, dataGuide }) {
  const { t, TC, locale, settings } = useApp();
  const isDone = task.status === "done";
  const [hovered, setHovered] = useState(false);
  const level = overdueLevel(task);

  // Left stripe: blue when selected, overdue colour otherwise
  const stripeColor = isSelected ? "#0ea5e9" : level ? OVERDUE_STRIPE[level] : null;
  const stripe = stripeColor ? `inset 3px 0 0 ${stripeColor}` : "";

  let outline = "";
  if (isSelected && isCursor) outline = "0 0 0 1px rgba(14,165,233,.35)";
  else if (isCursor)          outline = "0 0 0 1px rgba(14,165,233,.25)";
  else if (hovered)           outline = TC.taskHoverShadow;

  const shadow = [stripe, outline].filter(Boolean).join(", ") || "none";
  const bg = isSelected ? "rgba(14,165,233,.08)" : hovered ? TC.taskHoverBg : "transparent";

  return (
    <div
      data-task-id={task.id}
      {...(dataGuide ? { "data-guide": dataGuide } : {})}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ boxShadow: shadow, background: bg, transition: "background .1s, box-shadow .1s" }}
      className={`flex items-center px-4 rounded-lg cursor-pointer select-none
        ${settings?.condense ? "gap-2 py-1" : "gap-3 py-2.5"}
        ${task.status === "done" || task.status === "cancelled" ? "opacity-50" : ""}
        ${isBlocked && task.status !== "done" && task.status !== "cancelled" ? "opacity-55" : ""}`}
    >
      <button
        onClick={e => { e.stopPropagation(); onCheckboxClick(); }}
        className={`w-4 h-4 flex-shrink-0 rounded flex items-center justify-center border transition-colors
          ${isDone ? "bg-emerald-500 border-emerald-500" : "border-gray-500 hover:border-emerald-400 bg-transparent"}`}
      >
        {isDone && <Check size={11} strokeWidth={3} className="text-white" />}
      </button>
      {isBlocked && task.status !== "done" && task.status !== "cancelled" && (
        <Lock size={12} className="text-yellow-500/70 flex-shrink-0" />
      )}
      {(task.personas || []).map(p => (
        <span key={p} className="text-xs text-indigo-400/90 bg-indigo-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
          <User size={9} />{p}
        </span>
      ))}
      <StatusBadge status={task.status} onClick={e => { e.stopPropagation(); onStatusCycle(); }} />
      <PriorityBadge priority={task.priority} />
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${isDone ? "line-through text-gray-500" : isBlocked ? "text-gray-500" : TC.text}`}>{task.title}</span>
        {isBlocked && task.status !== "done" && (
          <span className="ml-2 text-xs text-yellow-400/70" title={`${t("task.dependsOn")} ${task.dependsOn}`}>
            <Lock size={10} className="inline" /> {t("flow.blocked")}
          </span>
        )}
        {!isBlocked && task.dependsOn && task.status !== "done" && (
          <span className="ml-2 text-xs text-emerald-400/70" title={`${t("task.dependsOn")} ${task.dependsOn}`}>
            <Check size={10} className="inline" /> {t("task.dependsOn")}
          </span>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {task.tags.map(tag => <span key={tag} className="text-xs text-sky-400/80 bg-sky-400/10 px-1.5 py-0.5 rounded">#{tag}</span>)}
          {task.due        && (
            <span className={`text-xs flex items-center gap-1 ${level ? OVERDUE_DATE_CLS[level] : "text-violet-400"}`}>
              <Calendar size={10} />
              {level && level !== "today" && <AlertTriangle size={10} />}
              {fmtDate(task.due, settings?.dateFormat, locale)}
            </span>
          )}
          {task.recurrence && <span className="text-xs text-teal-400" title={humanRecurrence(task.recurrence, locale) ?? task.recurrence}><Repeat size={10} /></span>}
          {task.flowId     && <span className="text-xs text-pink-400/80 bg-pink-400/10 px-1.5 py-0.5 rounded flex items-center gap-1"><Zap size={10} />{task.flowId}</span>}
        </div>
      )}
      {task.notes && task.notes.length > 0 && (
        <span className="text-xs text-amber-400/70 flex-shrink-0" title={`${task.notes.length} note${task.notes.length > 1 ? "s" : ""}`}><FileText size={10} /></span>
      )}
    </div>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────

function SectionDivider({ label, count }) {
  const { TC } = useApp();
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-red-400/80 flex items-center gap-1.5">
        <AlertTriangle size={11} className="text-red-400/70" />
        {label}
        <span className="text-xs font-normal normal-case tracking-normal bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full">{count}</span>
      </span>
      <div className={`flex-1 h-px border-t border-red-500/20`} />
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }) {
  const { t, TC } = useApp();
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: "rgba(0,0,0,0.55)" }}
         onClick={onCancel}>
      <div className={`border rounded-xl shadow-2xl p-6 w-72 ${TC.surface} ${TC.borderClass}`}
           onClick={e => e.stopPropagation()}>
        <p className={`text-sm font-medium text-center mb-5 ${TC.text}`}>{message}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onConfirm}
            className="px-5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            {t("confirm.yes")}
            <kbd className="text-xs bg-sky-500/40 text-white/80 px-1 py-0.5 rounded font-mono leading-none">↵</kbd>
          </button>
          <button onClick={onCancel}
            className={`px-5 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${TC.elevated} ${TC.textSec}`}>
            {t("confirm.cancel")}
            <kbd className={`text-xs px-1 py-0.5 rounded font-mono leading-none opacity-60 ${TC.surface}`}>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BulkBar ──────────────────────────────────────────────────────────────────

function BulkBar({ count, onDone, onCycle, onShift, onToday, onDelete, onClear }) {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-sky-900/30 border border-sky-500/30 rounded-lg flex-wrap">
      <span className="text-sky-300 text-sm font-medium">{count} {t("bulk.selected")}</span>
      <div className="flex gap-2 ml-auto flex-wrap">
        <button onClick={onDone}   className="px-3 py-1 bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded hover:bg-emerald-600/50 transition-colors text-xs">{t("bulk.complete")}</button>
        <button onClick={onCycle}  className="px-3 py-1 bg-gray-700/50 text-gray-300 border border-gray-600 rounded hover:bg-gray-700 transition-colors text-xs">{t("bulk.cycle")}</button>
        <button onClick={onToday}  className="px-3 py-1 bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded hover:bg-sky-600/50 transition-colors text-xs">{t("bulk.today")}</button>
        <button onClick={onShift}  className="px-3 py-1 bg-violet-600/30 text-violet-300 border border-violet-500/30 rounded hover:bg-violet-600/50 transition-colors text-xs">{t("bulk.shift")}</button>
        <button onClick={onDelete} className="px-3 py-1 bg-red-600/30 text-red-300 border border-red-500/30 rounded hover:bg-red-600/50 transition-colors text-xs">{t("bulk.delete")}</button>
        <button onClick={onClear}  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X size={14} /></button>
      </div>
    </div>
  );
}

// ─── ToastContainer ───────────────────────────────────────────────────────────

function ToastContainer({ toasts }) {
  const { TC } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`border px-4 py-2.5 rounded-lg shadow-xl text-sm ${TC.surface} ${TC.borderClass} ${TC.text}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── AutoThemeIcon ────────────────────────────────────────────────────────────

const AutoThemeIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.5 2.5h7l5 5v7l-5 5h-7l-5-5v-7z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 7.5L9.2 16.5M12 7.5L14.8 16.5M10.3 13h3.4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const themeOptions = [
  { key: "auto",  Icon: AutoThemeIcon },
  { key: "dark",  Icon: Moon          },
  { key: "light", Icon: Sun           },
];

// ─── Combobox ─────────────────────────────────────────────────────────────────
// Styled replacement for <input list="…"> + <datalist>.
// options: string[] or { value, label }[]
// onCommit: if provided, selecting an option calls onCommit(value) and resets input to ""
//           (used for multi-value tag/persona inputs)
// Without onCommit, selecting an option just sets the input value via onChange.

function Combobox({
  value, onChange, options = [], placeholder,
  className, style, onBlur, onKeyDown, onCommit, autoFocus,
}) {
  const { TC } = useApp();
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // typed: true once the user has changed the input since opening —
  // only then do we filter. On first open we show all options.
  const [typed, setTyped]         = useState(false);

  const normalized = options.map(o => typeof o === "string" ? { value: o, label: o } : o);
  const query    = (value || "").toLowerCase();
  const filtered = (typed && query)
    ? normalized.filter(o =>
        o.label.toLowerCase().includes(query) ||
        o.value.toLowerCase().includes(query))
    : normalized;

  const pickOption = (opt) => {
    if (onCommit) { onCommit(opt.value); onChange(""); }
    else          { onChange(opt.value); }
    setOpen(false);
    setActiveIdx(-1);
    setTyped(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && filtered.length) setOpen(true);
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && activeIdx >= 0 && open && filtered.length) {
      e.preventDefault();
      e.stopPropagation();
      pickOption(filtered[activeIdx]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setActiveIdx(-1);
      setTyped(false);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        className={className}
        style={style}
        value={value || ""}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1); setTyped(true); }}
        onFocus={() => { if (normalized.length > 0) setOpen(true); setTyped(false); }}
        onBlur={e => { setOpen(false); setActiveIdx(-1); setTyped(false); onBlur?.(e); }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div className={`absolute z-50 top-full left-0 mt-1 rounded-lg border shadow-2xl overflow-hidden ${TC.surface} ${TC.borderClass}`}
             style={{ minWidth: "100%", maxWidth: "360px" }}>
          <div className="overflow-y-auto" style={{ maxHeight: "180px" }}>
            {filtered.map((opt, i) => (
              <div
                key={opt.value}
                onMouseDown={e => { e.preventDefault(); pickOption(opt); }}
                className={`px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                  i === activeIdx
                    ? "bg-sky-500/20 text-sky-300"
                    : `${TC.text} ${TC.hoverBg}`
                }`}
              >
                {opt.label !== opt.value
                  ? <span>{opt.label}<span className={`ml-2 text-xs ${TC.textMuted}`}>{opt.value}</span></span>
                  : opt.label
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SettingsDialog ───────────────────────────────────────────────────────────

function SettingRow({ label, description, children }) {
  const { TC } = useApp();
  return (
    <div className="flex flex-col gap-2 py-3">
      <div>
        <div className={`text-sm font-medium ${TC.text}`}>{label}</div>
        {description && <div className={`text-xs mt-0.5 ${TC.textMuted}`}>{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsDialog({ onClose, onTriggerRtmImport, tasks, onClearAll, dbPath, onRevealDb, onOpenDb, onMoveDb, onRestartGuide, onCreateBackup, onListBackups, onRestoreBackup }) {
  const { t, locale, setLocale, theme, setTheme, TC, settings, updateSetting } = useApp();
  const [activeTab, setActiveTab] = useState("general");
  const [clearStep, setClearStep] = useState(0);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [csvFields, setCsvFields] = useState(() => new Set(CSV_FIELDS.map(f => f.key)));
  const [pathCopied, setPathCopied] = useState(false);
  const [backups, setBackups] = useState(null); // null = not loaded, [] = empty

  useEffect(() => {
    if (activeTab === "maintenance" && backups === null && onListBackups) {
      onListBackups().then(setBackups);
    }
  }, [activeTab, backups, onListBackups]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs = [
    { key: "general",    label: t("settings.tab.general"),    Icon: Settings,       danger: false },
    { key: "appearance", label: t("settings.tab.appearance"), Icon: Sun,            danger: false },
    { key: "ai",         label: t("settings.tab.ai"),         Icon: Zap,            danger: false },
    { key: "import",     label: t("settings.tab.import"),     Icon: Upload,         danger: false },
    { key: "export",     label: t("settings.tab.export"),     Icon: Download,       danger: false },
    { key: "about",        label: t("settings.tab.about"),        Icon: Info,          danger: false },
    { key: "maintenance",  label: t("settings.tab.maintenance"),  Icon: HardDrive,     danger: false },
    { key: "danger",       label: t("settings.tab.danger"),       Icon: AlertTriangle, danger: true  },
  ];

  const exportCSV = async () => {
    const fields = CSV_FIELDS.filter(f => csvFields.has(f.key));
    const header = fields.map(f => locale === "ru" ? f.labelRu : f.labelEn).join(",");
    const rows = tasks.map(task => {
      return fields.map(f => {
        const v = task[f.key];
        if (v == null) return "";
        if (Array.isArray(v)) {
          const s = v.join("; ").replace(/"/g, '""');
          return `"${s}"`;
        }
        const s = String(v).replace(/"/g, '""');
        return (s.includes(",") || s.includes("\n") || s.includes('"')) ? `"${s}"` : s;
      }).join(",");
    });
    const bom = "\uFEFF";
    const csv = bom + [header, ...rows].join("\n");

    // File System Access API — works in Tauri's WebView2 and modern browsers;
    // opens a native "Save as…" dialog which is the right UX for a desktop app.
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "tasks.csv",
          types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(csv);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user dismissed the dialog
        // unexpected error — fall through to the legacy method
      }
    }

    // Fallback: anchor-click download (works in regular browsers)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tasks.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleCsvField = (key, checked) => {
    setCsvFields(prev => { const n = new Set(prev); checked ? n.add(key) : n.delete(key); return n; });
  };

  const renderGeneral = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.general.title")}</h2>
      <div className={`divide-y ${TC.borderClass}`}>
        <SettingRow label={t("settings.general.language")}>
          <div className="flex gap-1.5">
            {Object.entries(LOCALE_NAMES).map(([code, name]) => (
              <button key={code} onClick={() => setLocale(code)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${locale === code ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {name}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.firstDay")}>
          <div className="flex gap-1.5">
            {[{ v: 1, l: t("settings.general.firstDay.monday") }, { v: 0, l: t("settings.general.firstDay.sunday") }].map(opt => (
              <button key={opt.v} onClick={() => updateSetting("firstDayOfWeek", opt.v)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.firstDayOfWeek === opt.v ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {opt.l}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.dateFormat")}>
          <select value={settings.dateFormat} onChange={e => updateSetting("dateFormat", e.target.value)}
            className={`border rounded px-2 py-1.5 text-sm outline-none focus:border-sky-500 ${TC.input} ${TC.inputText}`}>
            {DATE_FORMATS.map(f => (
              <option key={f} value={f}>{t("settings.general.dateFormat." + f)}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label={t("sb.clockFormat")}>
          <div className="flex gap-1.5">
            {["24h", "12h"].map(fmt => (
              <button key={fmt} onClick={() => updateSetting("clockFormat", fmt)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.clockFormat === fmt ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {fmt}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.general.newTaskActiveToday")}>
          <button onClick={() => updateSetting("newTaskActiveToday", !settings.newTaskActiveToday)}
            className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.newTaskActiveToday ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
            {settings.newTaskActiveToday ? "ON" : "OFF"}
          </button>
        </SettingRow>
        <SettingRow label={t("guide.restart")}>
          <button onClick={() => { onRestartGuide?.(); onClose(); }}
            className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}>
            {t("guide.restart")}
          </button>
        </SettingRow>
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.appearance.title")}</h2>
      <div className={`divide-y ${TC.borderClass}`}>
        <SettingRow label={t("settings.appearance.theme")}>
          <div className="flex gap-1.5">
            {themeOptions.map(({ key, Icon }) => (
              <button key={key} onClick={() => setTheme(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors font-medium ${theme === key ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                <Icon size={13} />{t("footer.theme." + key)}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.colorTheme")}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLOR_THEMES).map(([key, themeData]) => {
              const active = (settings.colorTheme || "default") === key;
              return (
                <button key={key} onClick={() => updateSetting("colorTheme", key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors font-medium border ${
                    active
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : `${TC.elevated} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`
                  }`}>
                  <span className="flex gap-0.5">
                    {themeData.swatches.map((color, i) => (
                      <span key={i} style={{ background: color }}
                        className="inline-block w-3 h-3 rounded-full" />
                    ))}
                  </span>
                  {t("settings.appearance.colorTheme." + key)}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.font")}
          description={t("settings.appearance.fontHint")}>
          <div className="flex items-center gap-2">
            <Combobox
              value={settings.fontFamily}
              onChange={v => updateSetting("fontFamily", v)}
              options={FONTS.filter(f => f.value)}
              placeholder={t("settings.appearance.fontSystem")}
              className={`border rounded px-2 py-1.5 text-sm outline-none focus:border-sky-500 w-56 ${TC.input} ${TC.inputText}`}
              style={{ fontFamily: settings.fontFamily || undefined }}
            />
            {settings.fontFamily && (
              <button onClick={() => updateSetting("fontFamily", "")}
                className={`p-1.5 rounded transition-colors flex-shrink-0 ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}
                title={t("settings.appearance.fontReset")}>
                <X size={14} />
              </button>
            )}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.fontSize")}>
          <div className="flex gap-1.5">
            {["normal", "bigger", "biggest"].map(size => (
              <button key={size} onClick={() => updateSetting("fontSize", size)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.fontSize === size ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {t("settings.appearance.fontSize." + size)}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={t("settings.appearance.condense")}>
          <div className="flex gap-1.5">
            {[{ v: false, k: "off" }, { v: true, k: "on" }].map(opt => (
              <button key={opt.k} onClick={() => updateSetting("condense", opt.v)}
                className={`px-3 py-1.5 rounded text-sm transition-colors font-medium ${settings.condense === opt.v ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`}>
                {t("settings.appearance.condense." + opt.k)}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>
    </div>
  );

  const renderAI = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.ai.title")}</h2>
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${TC.borderClass} ${TC.surfaceAlt}`}>
        <Zap size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
        <p className={`text-sm ${TC.textSec}`}>{t("settings.ai.comingSoon")}</p>
      </div>
    </div>
  );

  const renderImport = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.import.title")}</h2>
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.import.rtm")}</div>
        <div className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.import.rtmDesc")}</div>
        <button
          onClick={() => { onClose(); setTimeout(onTriggerRtmImport, 100); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm transition-colors">
          <Upload size={14} />{t("settings.import.rtmBtn")}
        </button>
      </div>
    </div>
  );

  const renderExport = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.export.title")}</h2>
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.export.csv")}</div>
        <div className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.export.csvDesc")}</div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>{t("settings.export.fields")}</div>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mb-4">
          {CSV_FIELDS.map(f => (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={csvFields.has(f.key)}
                onChange={e => toggleCsvField(f.key, e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer" />
              <span className={`text-xs ${TC.textSec} group-hover:text-gray-200 transition-colors`}>
                {locale === "ru" ? f.labelRu : f.labelEn}
              </span>
            </label>
          ))}
        </div>
        <button onClick={exportCSV} disabled={csvFields.size === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${csvFields.size > 0 ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}>
          <Download size={14} />{t("settings.export.csvBtn")}
        </button>
      </div>
    </div>
  );

  const renderAbout = () => (
    <div>
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.about.title")}</h2>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-violet-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap size={22} className="text-white" />
          </div>
          <div>
            <div className={`font-semibold ${TC.text}`}>Task Orchestrator</div>
            <div className={`text-xs ${TC.textMuted}`}>{t("settings.about.version")} 1.0.0</div>
          </div>
        </div>
        <p className={`text-sm leading-relaxed ${TC.textSec}`}>{t("settings.about.description")}</p>
      </div>
    </div>
  );

  const renderMaintenance = () => {
    const copyPath = () => {
      if (!dbPath) return;
      navigator.clipboard.writeText(dbPath).then(() => {
        setPathCopied(true);
        setTimeout(() => setPathCopied(false), 1500);
      });
    };
    return (
      <div>
        <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.maintenance.title")}</h2>

        {/* Current path */}
        <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>
            {t("settings.maintenance.currentDb")}
          </div>
          <div className={`text-xs break-all font-mono mb-3 ${TC.textSec}`}>{dbPath || "…"}</div>
          <div className="flex gap-2">
            <button onClick={copyPath}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
              <Copy size={12} />
              {pathCopied ? t("settings.maintenance.copied") : t("settings.maintenance.copyPath")}
            </button>
            {onRevealDb && (
              <button onClick={onRevealDb}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                <FolderOpen size={12} />
                {t("settings.maintenance.reveal")}
              </button>
            )}
          </div>
        </div>

        {/* Open another DB */}
        {onOpenDb && (
          <div className={`rounded-lg border p-4 mb-3 ${TC.elevated} ${TC.borderClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("settings.maintenance.open.label")}</div>
                <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.open.desc")}</div>
              </div>
              <button onClick={() => { onOpenDb(); onClose(); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                {t("settings.maintenance.open.btn")}
              </button>
            </div>
          </div>
        )}

        {/* Move DB */}
        {onMoveDb && (
          <div className={`rounded-lg border p-4 mb-4 ${TC.elevated} ${TC.borderClass}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("settings.maintenance.move.label")}</div>
                <div className={`text-xs ${TC.textMuted}`}>{t("settings.maintenance.move.desc")}</div>
              </div>
              <button onClick={() => { onMoveDb(); onClose(); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded text-sm font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                {t("settings.maintenance.move.btn")}
              </button>
            </div>
          </div>
        )}

        {/* Backups */}
        <div className={`rounded-lg border p-4 ${TC.elevated} ${TC.borderClass}`}>
          <div className={`text-sm font-medium mb-1 ${TC.text}`}>{t("backup.title")}</div>
          <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("backup.desc")}</div>
          <button
            onClick={async () => {
              const ok = await onCreateBackup?.();
              if (ok) { setBackups(null); /* reload list */ }
            }}
            className={`mb-3 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
            {t("backup.create")}
          </button>
          {backups === null ? (
            <div className={`text-xs ${TC.textMuted}`}>…</div>
          ) : backups.length === 0 ? (
            <div className={`text-xs ${TC.textMuted}`}>{t("backup.empty")}</div>
          ) : (
            <div className="space-y-2">
              {backups.map(b => (
                <div key={b.name} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${TC.surface} ${TC.borderClass}`}>
                  <div>
                    <div className={`text-xs font-medium ${TC.text}`}>{b.date}</div>
                    <div className={`text-[10px] ${TC.textMuted}`}>{t("backup.schema")}{b.schemaVersion}</div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(t("backup.confirmRestore"))) {
                        onRestoreBackup?.(b.path);
                        onClose();
                      }
                    }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${TC.surface} ${TC.borderClass} ${TC.textSec} ${TC.hoverBg}`}>
                    {t("backup.restore")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDanger = () => (
    <div>
      <h2 className="text-base font-semibold mb-4 text-red-400">{t("settings.danger.title")}</h2>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.danger.clearAll")}</div>
            <div className={`text-xs ${TC.textMuted}`}>{t("settings.danger.clearAllDesc")}</div>
          </div>
        </div>
        {clearStep === 0 && (
          <button onClick={() => setClearStep(1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm transition-colors">
            <Trash2 size={14} />{t("settings.danger.clearBtn")}
          </button>
        )}
        {clearStep === 1 && (
          <div className="space-y-3 mt-2">
            <div className={`text-sm font-medium ${TC.text}`}>{t("settings.danger.confirm1")}</div>
            <div>
              <div className={`text-xs mb-1.5 ${TC.textMuted}`}>{t("settings.danger.confirm2")}</div>
              <input value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="DELETE"
                className={`border rounded px-2 py-1.5 text-sm w-40 outline-none focus:border-red-500 ${TC.input} ${TC.inputText}`} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (clearConfirmText === "DELETE") {
                    onClearAll();
                    setClearStep(0);
                    setClearConfirmText("");
                    onClose();
                  }
                }}
                disabled={clearConfirmText !== "DELETE"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${clearConfirmText === "DELETE" ? "bg-red-600 hover:bg-red-500 text-white" : "opacity-40 bg-gray-700 text-gray-400 cursor-not-allowed"}`}>
                {t("settings.danger.confirmBtn")}
              </button>
              <button
                onClick={() => { setClearStep(0); setClearConfirmText(""); }}
                className={`px-3 py-1.5 rounded text-sm ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200 transition-colors`}>
                {t("settings.danger.cancelBtn")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "general":    return renderGeneral();
      case "appearance": return renderAppearance();
      case "ai":         return renderAI();
      case "import":     return renderImport();
      case "export":     return renderExport();
      case "about":        return renderAbout();
      case "maintenance":  return renderMaintenance();
      case "danger":       return renderDanger();
      default:           return null;
    }
  };

  const normalTabs  = tabs.filter(t => !t.danger);
  const dangerTabs  = tabs.filter(t => t.danger);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 flex rounded-xl shadow-2xl border overflow-hidden ${TC.surface} ${TC.borderClass}`}
           style={{ width: 720, maxHeight: "85vh" }}>

        {/* ── Left navigation ── */}
        <div className={`w-48 flex-shrink-0 border-r flex flex-col ${TC.borderClass} ${TC.surfaceAlt}`}>
          <div className={`px-4 py-4 text-xs font-semibold uppercase tracking-widest ${TC.textMuted}`}>
            {t("settings.title")}
          </div>
          <nav className="flex-1 flex flex-col px-2 pb-2 gap-0.5">
            {normalTabs.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                  activeTab === key ? "bg-sky-600/20 text-sky-400" : `${TC.textSec} ${TC.hoverBg} hover:text-gray-200`
                }`}>
                <Icon size={14} className="flex-shrink-0" />{label}
              </button>
            ))}
            <div className="flex-1" />
            <div className={`my-2 border-t ${TC.borderClass}`} />
            {dangerTabs.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                  activeTab === key ? "bg-red-500/20 text-red-400" : `text-red-400/70 ${TC.hoverBg} hover:text-red-400`
                }`}>
                <Icon size={14} className="flex-shrink-0" />{label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right content ── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="p-6">{renderContent()}</div>
        </div>

        {/* ── Close button ── */}
        <button onClick={onClose}
          className={`absolute top-3 right-3 p-1.5 rounded transition-colors ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ tasks, filters, setFilter, clearFilter, onOpenSettings }) {
  const { t, theme, setTheme, TC, settings, flowMeta, openUrl: ctxOpenUrl } = useApp();

  const lists    = useMemo(() => { const m = {}; tasks.forEach(t => { if (t.list) m[t.list] = (m[t.list] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const tags     = useMemo(() => { const m = {}; tasks.forEach(t => t.tags.forEach(g => { m[g] = (m[g] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const flows    = useMemo(() => { const m = {}; tasks.forEach(t => { if (t.flowId) m[t.flowId] = (m[t.flowId] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const personas = useMemo(() => { const m = {}; tasks.forEach(t => (t.personas || []).forEach(p => { m[p] = (m[p] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  // Flow progress: { name: { total, done } }
  const flowProgress = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (!t.flowId) return;
      if (!m[t.flowId]) m[t.flowId] = { total: 0, done: 0 };
      m[t.flowId].total++;
      if (t.status === "done") m[t.flowId].done++;
    });
    return m;
  }, [tasks]);
  const statusCounts = useMemo(() => { const m = {}; STATUSES.forEach(s => { m[s] = tasks.filter(t => t.status === s).length; }); return m; }, [tasks]);

  // Collapsed state per section; hotkeys collapsed by default
  const [open, setOpen] = useState({ agenda: true, status: true, lists: true, tags: true, personas: true, flows: true, hotkeys: false });

  const agendaCounts = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const tom = d1.toISOString().slice(0, 10);
    const d7 = new Date(); d7.setDate(d7.getDate() + 7);
    const max7 = d7.toISOString().slice(0, 10);
    const d30 = new Date(); d30.setDate(d30.getDate() + 30);
    const max30 = d30.toISOString().slice(0, 10);
    const isPastDue = tt => tt.due && tt.due < todayStr && tt.status !== "done" && tt.status !== "cancelled";
    return {
      overdue:  tasks.filter(isPastDue).length,
      today:    tasks.filter(tt => tt.due === todayStr || isPastDue(tt)).length,
      tomorrow: tasks.filter(tt => tt.due === tom || isPastDue(tt)).length,
      week:     tasks.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max7) || isPastDue(tt)).length,
      month:    tasks.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max30) || isPastDue(tt)).length,
    };
  }, [tasks]);
  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }));
  const SECTION_KEYS = ['agenda', 'status', 'lists', 'tags', 'personas', 'flows'];
  const allExpanded = SECTION_KEYS.every(k => open[k]);
  const toggleAll = () => {
    const target = !allExpanded;
    setOpen(o => {
      const next = { ...o };
      for (const k of SECTION_KEYS) next[k] = target;
      return next;
    });
  };

  const Section = ({ id, label, icon: Icon, children, borderTop = false, extra }) => (
    <div className={borderTop ? `pt-4 border-t ${TC.borderClass}` : ""}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <button
          onClick={() => toggle(id)}
          className={`flex items-center gap-1.5 flex-1 group`}
        >
          <span className={`text-xs font-semibold uppercase tracking-wider flex-1 text-left flex items-center gap-1 ${TC.textMuted}`}>
            {Icon && <Icon size={12} />}{label}
          </span>
          <ChevronRight
            size={12}
            className={`${TC.textMuted} transition-transform duration-150 ${open[id] ? "rotate-90" : ""}`}
        />
        </button>
        {extra}
      </div>
      {open[id] && children}
    </div>
  );

  const FilterItem = ({ icon: Icon, label, count, filterKey, filterValue }) => {
    const isActive = filters[filterKey] === filterValue;
    return (
      <button onClick={() => setFilter(filterKey, filterValue)}
        className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${isActive ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
        <Icon size={14} className="flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-xs opacity-60">{count}</span>
      </button>
    );
  };

  const hotkeys = [
    ["Ctrl+N",        t("hk.newTask")],
    ["↑ / ↓",         t("hk.cursor")],
    ["Shift+↑/↓",     t("hk.extend")],
    ["Home / End",    t("hk.homeEnd")],
    ["Ctrl+Shift+A",  t("hk.selectAll")],
    ["Space",         t("hk.complete")],
    ["S",             t("hk.cycle")],
    ["Del",           t("hk.delete")],
    ["1 / 2 / 3 / 4", t("hk.priority")],
    ["Shift+P",       t("hk.postpone")],
    ["Ctrl+Z",        t("hk.undo")],
    ["Esc",           t("hk.escape")],
  ];

  return (
    <aside data-guide="sidebar" className={`w-56 flex-shrink-0 border-r p-4 flex flex-col overflow-hidden ${TC.aside}`}
           style={{ scrollbarWidth: "thin" }}>
      <div className={`flex-1 ${settings?.condense ? "space-y-2" : "space-y-4"} overflow-y-auto`}>

        <Section id="agenda" label={t("sidebar.agenda")} icon={Calendar} extra={
          <button onClick={(e) => { e.stopPropagation(); toggleAll(); }} className={`ml-auto transition-colors ${TC.textMuted} hover:text-gray-300`}
            title={allExpanded ? t("sidebar.collapseAll") : t("sidebar.expandAll")}>
            {allExpanded ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
          </button>
        }>
          <div className="space-y-0.5">
            <FilterItem icon={Calendar}      label={t("agenda.today")}    count={agendaCounts.today}    filterKey="dateRange" filterValue="today" />
            <FilterItem icon={Calendar}      label={t("agenda.tomorrow")} count={agendaCounts.tomorrow} filterKey="dateRange" filterValue="tomorrow" />
            <FilterItem icon={Calendar}      label={t("agenda.week")}     count={agendaCounts.week}     filterKey="dateRange" filterValue="week" />
            <FilterItem icon={Calendar}      label={t("agenda.month")}    count={agendaCounts.month}    filterKey="dateRange" filterValue="month" />
            <FilterItem icon={AlertTriangle} label={t("agenda.overdue")}  count={agendaCounts.overdue}  filterKey="dateRange" filterValue="overdue" />
          </div>
        </Section>

        <Section id="status" label={t("sidebar.status")}>
          <div className="space-y-0.5">
            <button onClick={() => clearFilter("status")}
              className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${!filters.status ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              <Filter size={14} /><span className="flex-1 text-left">{t("filter.all")}</span><span className="text-xs opacity-60">{tasks.length}</span>
            </button>
            {STATUSES.map(s => <FilterItem key={s} icon={STATUS_ICONS[s]} label={t("status." + s)} count={statusCounts[s]} filterKey="status" filterValue={s} />)}
          </div>
        </Section>

        <Section id="lists" label={t("sidebar.lists")}>
          <div className="space-y-0.5">{lists.map(([n, c]) => <FilterItem key={n} icon={List} label={n} count={c} filterKey="list" filterValue={n} />)}</div>
        </Section>

        <Section id="tags" label={t("sidebar.tags")}>
          <div className="space-y-0.5">{tags.map(([n, c]) => <FilterItem key={n} icon={Hash} label={n} count={c} filterKey="tag" filterValue={n} />)}</div>
        </Section>

        {personas.length > 0 && (
          <Section id="personas" label={t("sidebar.personas")}>
            <div className="space-y-0.5">{personas.map(([n, c]) => <FilterItem key={n} icon={User} label={n} count={c} filterKey="persona" filterValue={n} />)}</div>
          </Section>
        )}

        {flows.length > 0 && (
          <Section id="flows" label="Task Flows">
            <div className="space-y-1">{flows.map(([n, c]) => {
              const prog = flowProgress[n];
              const pct = prog && prog.total > 0 ? Math.round(prog.done / prog.total * 100) : 0;
              const meta = flowMeta[n];
              const barColor = meta?.color || "#f472b6";
              const isActive = filters.flow === n;
              return (
                <div key={n}>
                  <button onClick={() => setFilter("flow", n)}
                    className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${isActive ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
                    <Zap size={14} className="flex-shrink-0" style={meta?.color ? { color: meta.color } : {}} />
                    <span className="flex-1 text-left truncate">{n}</span>
                    <span className="text-xs opacity-60">{c}</span>
                  </button>
                  {prog && prog.total > 0 && (
                    <div className="mx-3 mt-0.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  )}
                </div>
              );
            })}</div>
          </Section>
        )}

        <Section id="hotkeys" label={t("sidebar.hotkeys")} icon={Keyboard} borderTop>
          <div className={`space-y-1.5 text-xs ${TC.textMuted}`}>
            {hotkeys.map(([k, d]) => (
              <div key={k} className="flex items-start gap-2">
                <kbd className={`px-1.5 py-0.5 rounded font-mono whitespace-nowrap flex-shrink-0 ${TC.elevated} ${TC.textSec}`}>{k}</kbd>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </Section>

      </div>

      {/* ── Footer: theme / settings ── */}
      <div className={`py-2 mt-3 border-t flex items-center justify-between gap-1 flex-shrink-0 ${TC.borderClass}`}>
        <div className="flex items-center gap-0.5">
          {themeOptions.map(({ key, Icon }) => (
            <button key={key} onClick={() => setTheme(key)} title={t("footer.theme." + key)}
              className={`p-1.5 rounded transition-colors ${theme === key ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              <Icon size={13} />
            </button>
          ))}
        </div>
        <button onClick={onOpenSettings} title={t("footer.settings")}
          className={`p-1.5 rounded transition-colors ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}>
          <Settings size={13} />
        </button>
      </div>

      {/* ── Author ── */}
      <div className={`pt-1 mt-1 border-t flex justify-end ${TC.borderClass}`}>
        <span className={`text-xs ${TC.textMuted} opacity-50 cursor-pointer hover:opacity-80 transition-opacity`}
              title="https://daybov.com/"
              onClick={() => ctxOpenUrl("https://daybov.com/")}>
          …{t("footer.author")}
        </span>
      </div>
    </aside>
  );
}

// ─── FlowView ─────────────────────────────────────────────────────────────────

function FlowView({ tasks, activeFlow, onStartNext, onUpdateFlow, onDeleteFlow }) {
  const { t, TC, flowMeta } = useApp();
  const meta = flowMeta[activeFlow] || {};
  const flowTasks = tasks.filter(t => t.flowId === activeFlow);
  if (!flowTasks.length && !meta.description) return null;

  const doneSet = new Set(tasks.filter(t => t.status === "done").map(t => t.id));

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
        <div className={`border rounded-lg px-3 py-2 min-w-[10rem] ${sc}`}>
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
    <div className="mt-4 p-4 bg-gray-800/30 border border-gray-700/50 rounded-xl">
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
    </div>
  );
}

// ─── CalendarPanel ────────────────────────────────────────────────────────────

function CalendarPanel({ tasks, calendarFilter, setCalendarFilter, dateRange }) {
  const { t, TC, settings } = useApp();
  const today = new Date();
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const taskDays = useMemo(() => {
    const s = new Set();
    tasks.forEach(t => { if (t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due)) s.add(t.due); });
    return s;
  }, [tasks]);

  const todayStr = localIsoDate(today);
  const formatDay = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Compute highlighted date range from sidebar dateRange filter
  const rangeEnd = useMemo(() => {
    if (!dateRange) return null;
    const d = new Date();
    if (dateRange === "today") return todayStr;
    if (dateRange === "tomorrow") { d.setDate(d.getDate() + 1); return localIsoDate(d); }
    if (dateRange === "week") { d.setDate(d.getDate() + 7); return localIsoDate(d); }
    if (dateRange === "month") { d.setDate(d.getDate() + 30); return localIsoDate(d); }
    return null;
  }, [dateRange, todayStr]);
  const isInRange = (dateStr) => rangeEnd && dateStr >= todayStr && dateStr <= rangeEnd;

  // firstDayOfWeek: 1 = Monday (default), 0 = Sunday
  const fdow = settings?.firstDayOfWeek ?? 1;
  const firstDow = (new Date(year, month, 1).getDay() - fdow + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className={`flex-shrink-0 border-b p-3 select-none ${TC.borderClass}`}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className={`p-1 rounded transition-colors ${TC.textMuted} hover:text-gray-200`}>
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
          className={`text-xs font-medium transition-colors hover:text-sky-400 ${TC.textSec}`}>
          {t("cal.month." + month)} {year}
        </button>
        <button onClick={nextMonth} className={`p-1 rounded transition-colors ${TC.textMuted} hover:text-gray-200`}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`text-center text-xs font-medium ${TC.textMuted}`}>
            {t("cal.day." + ((i + fdow) % 7 + 6) % 7)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = formatDay(d);
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === calendarFilter;
          const hasTasks   = taskDays.has(dateStr);
          const inRange    = isInRange(dateStr);
          return (
            <button key={d} onClick={() => setCalendarFilter(isSelected ? null : dateStr)}
              className={`relative flex items-center justify-center h-7 w-full rounded text-xs font-medium transition-colors
                ${isSelected ? "bg-sky-600 text-white"
                : isToday    ? `${TC.elevated} text-sky-400`
                : inRange    ? "bg-sky-600/15 text-sky-300"
                :              `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              {d}
              {hasTasks && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? "bg-white/70" : "bg-violet-400"}`} />
              )}
            </button>
          );
        })}
      </div>
      {calendarFilter && (
        <button onClick={() => setCalendarFilter(null)}
          className={`mt-2 w-full text-xs text-center transition-colors ${TC.textMuted} hover:text-gray-300`}>
          {t("cal.clearFilter")} × {calendarFilter}
        </button>
      )}
    </div>
  );
}

// ─── humanRecurrence ──────────────────────────────────────────────────────────
// Converts a recurrence value (plain keyword or iCalendar RRULE) to a
// human-readable string in English or Russian.

function ruPlural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function humanRecurrence(value, locale) {
  if (!value) return null;
  const isRu = locale === "ru";

  // Simple keyword shortcuts (used in quick entry and seed data)
  const SIMPLE = {
    daily:    { en: "Every day",    ru: "Каждый день"    },
    weekly:   { en: "Every week",   ru: "Каждую неделю"  },
    monthly:  { en: "Every month",  ru: "Каждый месяц"   },
    yearly:   { en: "Every year",   ru: "Каждый год"     },
    annual:   { en: "Every year",   ru: "Каждый год"     },
    biweekly: { en: "Every 2 weeks",ru: "Каждые 2 недели"},
  };
  const simple = SIMPLE[value.toLowerCase().trim()];
  if (simple) return isRu ? simple.ru : simple.en;

  // Parse RRULE (with or without the "RRULE:" prefix)
  const ruleStr = value.startsWith("RRULE:") ? value.slice(6) : value;
  const p = {};
  for (const seg of ruleStr.split(";")) {
    const eq = seg.indexOf("=");
    if (eq > 0) p[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }

  const freq = p["FREQ"]?.toUpperCase();
  if (!freq) return value; // unknown format — show as-is

  const interval = parseInt(p["INTERVAL"] || "1");
  const byDay    = p["BYDAY"];
  const byMonth  = p["BYMONTH"];

  const DAY = {
    en: { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" },
    ru: { MO: "Пн",  TU: "Вт",  WE: "Ср",  TH: "Чт",  FR: "Пт",  SA: "Сб",  SU: "Вс"  },
  };
  const MONTH = {
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    ru: ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"],
  };
  const dayNames = isRu ? DAY.ru : DAY.en;

  // Parses BYDAY day list like "MO,WE,FR" or "1MO,-1FR"
  const parseDays = (raw) =>
    raw.split(",").map(d => {
      const m = d.match(/([A-Z]{2})$/);
      return m ? (dayNames[m[1]] ?? m[1]) : d;
    }).join(", ");

  // Ordinal strings for BYDAY with numeric prefix (monthly recurrence)
  const ORD_EN = { "1":"1st","2":"2nd","3":"3rd","4":"4th","-1":"Last" };
  const ORD_RU = { "1":"Первый","2":"Второй","3":"Третий","4":"Четвёртый","-1":"Последний" };
  const ordStr = (n) => (isRu ? ORD_RU[n] : ORD_EN[n]) ?? (isRu ? n : `${n}th`);

  switch (freq) {
    case "DAILY": {
      if (interval === 1) return isRu ? "Каждый день" : "Every day";
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "день", "дня", "дней")}`
        : `Every ${interval} days`;
    }
    case "WEEKLY": {
      const days = byDay ? `: ${parseDays(byDay)}` : "";
      if (interval === 1) return isRu ? `Каждую неделю${days}` : `Every week${days}`;
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "неделю", "недели", "недель")}${days}`
        : `Every ${interval} weeks${days}`;
    }
    case "MONTHLY": {
      if (byDay) {
        const m = byDay.match(/^(-?\d)([A-Z]{2})$/);
        if (m) {
          const day = dayNames[m[2]] ?? m[2];
          return isRu
            ? `${ordStr(m[1])} ${day} каждого месяца`
            : `${ordStr(m[1])} ${day} each month`;
        }
      }
      if (interval === 1) return isRu ? "Каждый месяц" : "Every month";
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "месяц", "месяца", "месяцев")}`
        : `Every ${interval} months`;
    }
    case "YEARLY": {
      const extra = (byMonth && !isNaN(parseInt(byMonth)))
        ? ` (${(isRu ? MONTH.ru : MONTH.en)[parseInt(byMonth) - 1] ?? byMonth})`
        : "";
      if (interval === 1) return isRu ? `Каждый год${extra}` : `Every year${extra}`;
      return isRu
        ? `Каждые ${interval} ${ruPlural(interval, "год", "года", "лет")}${extra}`
        : `Every ${interval} years${extra}`;
    }
    default:
      return value;
  }
}

// ─── DatePicker (inline calendar popup for date fields) ──────────────────────

function DatePicker({ value, onChange, onClose, anchorRef }) {
  const { t, TC, settings } = useApp();
  const initial = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00") : new Date();
  const [viewDate, setViewDate] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);
  const formatDay = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const fdow = settings?.firstDayOfWeek ?? 1;
  const firstDow = (new Date(year, month, 1).getDay() - fdow + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  // Position fixed relative to anchor
  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const popH = 260, popW = 220;
    let top = r.bottom + 4;
    let left = r.left;
    if (top + popH > window.innerHeight) top = r.top - popH - 4;
    if (left + popW > window.innerWidth) left = window.innerWidth - popW - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [anchorRef]);

  return (
    <div ref={ref} className={`fixed z-[200] rounded-lg border shadow-xl p-2 ${TC.surface} ${TC.borderClass}`} style={{ width: 220, top: pos.top, left: pos.left }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-0.5">
          <button onClick={() => setViewDate(new Date(year - 1, month, 1))} className={`p-0.5 rounded text-[10px] ${TC.textMuted} hover:text-gray-200`}>«</button>
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className={`p-0.5 rounded ${TC.textMuted} hover:text-gray-200`}><ChevronLeft size={12} /></button>
        </div>
        <button onClick={() => setViewDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          className={`text-xs font-medium transition-colors hover:text-sky-400 ${TC.textSec}`}>
          {t("cal.month." + month)} {year}
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className={`p-0.5 rounded ${TC.textMuted} hover:text-gray-200`}><ChevronRight size={12} /></button>
          <button onClick={() => setViewDate(new Date(year + 1, month, 1))} className={`p-0.5 rounded text-[10px] ${TC.textMuted} hover:text-gray-200`}>»</button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`text-center text-[10px] font-medium ${TC.textMuted}`}>
            {t("cal.day." + ((i + fdow) % 7 + 6) % 7)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = formatDay(d);
          const isToday    = dateStr === todayStr;
          const isSelected = dateStr === value;
          return (
            <button key={d} onClick={() => { onChange(dateStr); onClose(); }}
              className={`flex items-center justify-center h-6 rounded text-xs transition-colors
                ${isSelected ? "bg-sky-600 text-white"
                : isToday    ? `${TC.elevated} text-sky-400`
                :              `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              {d}
            </button>
          );
        })}
      </div>
      {value && (
        <button onClick={() => { onChange(null); onClose(); }}
          className={`mt-1.5 w-full text-[10px] text-center transition-colors ${TC.textMuted} hover:text-red-400`}>
          ✕ {t("cal.clearFilter")}
        </button>
      )}
    </div>
  );
}

function DatePickerAnchor({ value, onChange, onClose }) {
  const anchorRef = useRef(null);
  return (
    <span ref={anchorRef} className="inline-block">
      <DatePicker anchorRef={anchorRef} value={value} onChange={onChange} onClose={onClose} />
    </span>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────

function DetailPanel({ selected, tasks, onUpdate, onEditFull }) {
  const { t, TC, lists, locale, settings, openUrl: ctxOpenUrl } = useApp();
  const dateLocale = t("footer.dateLocale");
  const [editingField, setEditingField] = useState(null);
  const [editValue,    setEditValue]    = useState("");
  const [noteModal, setNoteModal] = useState(null); // { taskId, note } | null
  const [noteModalContent, setNoteModalContent] = useState("");

  const startEdit = (field, currentVal) => {
    setEditingField(field);
    setEditValue(currentVal ?? "");
  };
  const editRef = useRef(null);
  const commitEdit = (taskId, field) => {
    if (editingField !== field) return;
    // Read from ref (uncontrolled) if available, else from state
    let raw = editRef.current ? editRef.current.value : editValue;
    let val = raw.trim() || null;
    if (field === "url" && val) {
      if (!/^https?:\/\/.+/i.test(val)) val = "https://" + val;
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val)) { cancelEdit(); return; }
    }
    if ((field === "due" || field === "dateStart") && val) {
      const parsed = parseDateInput(val);
      if (!parsed) { cancelEdit(); return; }
      val = parsed;
    }
    const numVal = field === "priority" ? Number(raw.trim()) : undefined;
    onUpdate(taskId, { [field]: numVal !== undefined ? numVal : val });
    setEditingField(null);
  };
  const cancelEdit = () => setEditingField(null);

  // Renders value inline; click → edit input, blur → save
  // `value`   — actual stored value (e.g. "active", "2")
  // `display` — localized label shown to the user (e.g. "Active", "High")
  const Editable = ({ taskId, field, value, display, type = "text", options = null }) => {
    const inputCls = `w-full text-sm rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-sky-500 border ${TC.elevated} ${TC.text} ${TC.borderClass}`;
    if (editingField === field) {
      if (options) {
        return (
          <select value={editValue} autoFocus
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit(taskId, field)}
            onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") commitEdit(taskId, field); }}
            className={inputCls}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      if (field === "list") {
        return (
          <Combobox
            autoFocus
            className={inputCls}
            value={editValue}
            onChange={setEditValue}
            options={lists}
            onBlur={() => commitEdit(taskId, field)}
            onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") commitEdit(taskId, field); }}
          />
        );
      }
      if (type === "date") {
        return (
          <DatePickerAnchor
            value={editValue || null}
            onChange={(iso) => { onUpdate(taskId, { [field]: iso }); setEditingField(null); }}
            onClose={cancelEdit}
          />
        );
      }
      return (
        <input ref={editRef} type="text" defaultValue={editValue} autoFocus
          onBlur={() => commitEdit(taskId, field)}
          onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") { e.preventDefault(); commitEdit(taskId, field); } }}
          className={inputCls} />
      );
    }
    // use `value` (actual stored value) as the edit seed
    const editSeed = value !== undefined && value !== null ? String(value) : "";
    if (field === "url" && display) {
      return (
        <span className="flex items-center gap-1 min-w-0">
          <span className="cursor-pointer truncate text-sky-400 hover:underline hover:text-sky-300 transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctxOpenUrl(display); }}
                title={display}>
            {display.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </span>
          <Edit3 size={10} className={`flex-shrink-0 cursor-pointer ${TC.textMuted} hover:text-sky-400`}
                 onClick={() => startEdit(field, editSeed)} />
        </span>
      );
    }
    return (
      <span className={`cursor-text hover:opacity-75 transition-opacity ${display ? "" : `italic text-xs ${TC.textMuted}`}`}
            onClick={() => startEdit(field, editSeed)}>
        {display || "—"}
      </span>
    );
  };

  const Row = ({ icon: Icon, label, children }) => (
    <div className={`flex items-start gap-2 py-2 border-b last:border-0 ${TC.borderClass}`}>
      <Icon size={13} className={`mt-0.5 flex-shrink-0 ${TC.textMuted}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs mb-0.5 ${TC.textMuted}`}>{label}</div>
        <div className={`text-sm break-words ${TC.text}`}>{children}</div>
      </div>
    </div>
  );

  if (selected.size === 0) {
    return (
      <aside className={`w-64 flex-shrink-0 border-l p-5 flex flex-col items-center justify-center gap-2 overflow-y-auto ${TC.borderClass}`}>
        <Inbox size={32} className={TC.textMuted} style={{ opacity: 0.5 }} />
        <p className={`text-xs text-center ${TC.textMuted}`}>
          {t("detail.empty").split("\n").map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
        </p>
      </aside>
    );
  }

  if (selected.size > 1) {
    const selectedTasks = tasks.filter(t => selected.has(t.id));
    return (
      <aside className={`w-64 flex-shrink-0 border-l p-5 overflow-y-auto ${TC.borderClass}`}>
        <div className={`text-center mb-4 pb-4 border-b ${TC.borderClass}`}>
          <div className="text-4xl font-bold text-sky-400">{selected.size}</div>
          <div className={`text-xs mt-1 ${TC.textSec}`}>{t("detail.tasksSelected")}</div>
        </div>
        <div className="space-y-1">
          {selectedTasks.map(t => {
            const Icon = STATUS_ICONS[t.status] ?? STATUS_ICONS["inbox"];
            return (
              <div key={t.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${TC.elevated}`}>
                <Icon size={12} className={`flex-shrink-0 ${TC.textMuted}`} />
                <span className={`text-xs truncate ${TC.textSec}`}>{t.title}</span>
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  const task = tasks.find(t => t.id === [...selected][0]);
  if (!task) return null;

  // Defensive: fall back to 'inbox' icon if task has an unexpected status value
  const safeStatus = STATUS_ICONS[task.status] ? task.status : "inbox";
  const StatusIcon = STATUS_ICONS[safeStatus];
  const statusColors = {
    inbox:     "bg-gray-600/50 text-gray-200 border border-gray-500/40",
    active:    "bg-sky-600/20 text-sky-300 border border-sky-500/40",
    done:      "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40",
    cancelled: "bg-red-600/20 text-red-300 border border-red-500/40",
  };

  return (
    <aside className={`w-64 flex-shrink-0 border-l p-5 overflow-y-auto ${TC.borderClass}`}>

      {/* Title + edit button */}
      <div className={`mb-4 pb-4 border-b ${TC.borderClass}`}>
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className={`text-xs ${TC.textMuted}`}>{t("detail.task")}</p>
          <button onClick={() => onEditFull(task.id)} title={t("edit.title")}
            className={`p-0.5 rounded hover:opacity-70 transition-opacity flex-shrink-0 ${TC.textMuted}`}>
            <FileText size={12} />
          </button>
        </div>
        {editingField === "__title__"
          ? <input autoFocus className={`w-full text-sm rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-sky-500 border font-medium ${TC.elevated} ${TC.text} ${TC.borderClass}`}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => commitEdit(task.id, "__title__")}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(task.id, "__title__"); if (e.key === "Escape") cancelEdit(); }} />
          : <h2 className={`text-sm font-medium leading-snug cursor-text hover:opacity-75 ${TC.text}`}
                onClick={() => startEdit("__title__", task.title)}>{task.title}</h2>
        }
      </div>

      <div className="space-y-0">
        <Row icon={StatusIcon} label={t("detail.status")}>
          <Editable taskId={task.id} field="status" value={safeStatus} display={t("status." + safeStatus)}
            options={STATUSES.map(s => ({ value: s, label: t("status." + s) }))} />
        </Row>
        <Row icon={Flag} label={t("detail.priority")}>
          <Editable taskId={task.id} field="priority" value={String(task.priority)} display={t("priority." + task.priority)}
            options={[1,2,3,4].map(p => ({ value: String(p), label: `${p} — ${t("priority."+p)}` }))} />
        </Row>
        <Row icon={List} label={t("detail.list")}>
          <Editable taskId={task.id} field="list" value={task.list} display={task.list} type="text" />
        </Row>
        <Row icon={Hash} label={t("detail.tags")}>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {task.tags.length > 0
              ? task.tags.map(tag => <span key={tag} className="text-xs text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded">#{tag}</span>)
              : <span className={`text-xs italic ${TC.textMuted}`}>—</span>
            }
          </div>
        </Row>
        {(task.personas || []).length > 0 && (
          <Row icon={User} label={t("detail.personas")}>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(task.personas || []).map(p => (
                <span key={p} className="text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <User size={9} />{p}
                </span>
              ))}
            </div>
          </Row>
        )}
        <Row icon={Calendar} label={t("detail.due")}>
          <Editable taskId={task.id} field="due" value={task.due} display={fmtDate(task.due, settings?.dateFormat, locale)} type="date" />
        </Row>
        {(task.recurrence || editingField === "recurrence") && (
          <Row icon={Repeat} label={t("detail.recurrence")}>
            <Editable taskId={task.id} field="recurrence"
              value={task.recurrence}
              display={humanRecurrence(task.recurrence, locale) ?? task.recurrence} />
          </Row>
        )}
        {(task.flowId || editingField === "flowId") && (
          <Row icon={Zap} label={t("detail.flow")}>
            <Editable taskId={task.id} field="flowId" value={task.flowId} display={task.flowId} />
          </Row>
        )}
        {task.dependsOn && (
          <Row icon={CornerDownRight} label={t("detail.dependsOn")}>
            <span className="text-yellow-300">
              {tasks.find(x => x.id === task.dependsOn)?.title || task.dependsOn}
            </span>
          </Row>
        )}
        <Row icon={Link} label={t("detail.url")}>
          <Editable taskId={task.id} field="url" value={task.url} display={task.url} type="url" />
        </Row>
        <Row icon={Calendar} label={t("detail.dateStart")}>
          <Editable taskId={task.id} field="dateStart" value={task.dateStart} display={fmtDate(task.dateStart, settings?.dateFormat, locale)} type="date" />
        </Row>
        <Row icon={Clock} label={t("detail.estimate")}>
          <Editable taskId={task.id} field="estimate" value={task.estimate} display={task.estimate} />
        </Row>
        {task.postponed > 0 && (
          <Row icon={Repeat} label={t("detail.postponed")}>
            <span className={TC.textSec}>{task.postponed}×</span>
          </Row>
        )}
        <Row icon={Calendar} label={t("detail.created")}>
          <span className={`text-xs ${TC.textMuted}`}>
            {new Date(task.createdAt).toLocaleString(dateLocale, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
          </span>
        </Row>
        {task.completedAt && (
          <Row icon={CheckCircle2} label={t("detail.completedAt")}>
            <span className={`text-xs ${TC.textMuted}`}>
              {new Date(task.completedAt).toLocaleString(dateLocale, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
            </span>
          </Row>
        )}
      </div>
      {task.notes && task.notes.length > 0 && (
        <div className={`mt-4 pt-4 border-t ${TC.borderClass}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <FileText size={12} className={TC.textMuted} />
            <span className={`text-xs font-medium ${TC.textMuted}`}>{t("detail.notes")} ({task.notes.length})</span>
          </div>
          <div className="space-y-2">
            {task.notes.map(note => (
              <div
                key={note.id}
                title={t("note.dblclick")}
                onDoubleClick={() => { setNoteModal({ taskId: task.id, note, allNotes: task.notes }); setNoteModalContent(note.content); }}
                className={`rounded p-2 text-xs cursor-pointer ${TC.elevated} hover:border hover:${TC.borderClass} transition-colors`}
              >
                <div className={`whitespace-pre-wrap leading-relaxed ${TC.textMuted}`}>{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note edit modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNoteModal(null)}>
          <div
            className={`w-full max-w-lg mx-4 rounded-xl shadow-2xl border ${TC.surface} ${TC.borderClass} flex flex-col`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-4 py-3 border-b ${TC.borderClass}`}>
              <div className="flex items-center gap-2">
                <FileText size={14} className={TC.textMuted} />
                <span className={`text-sm font-medium ${TC.text}`}>{t("detail.notes")}</span>
              </div>
              <button onClick={() => setNoteModal(null)} className={`${TC.textMuted} hover:${TC.text} transition-colors`}><X size={16} /></button>
            </div>
            <div className="p-4">
              <textarea
                className={`w-full text-sm rounded-md px-3 py-2 border outline-none focus:ring-1 focus:ring-sky-500 resize-none ${TC.elevated} ${TC.text} ${TC.borderClass}`}
                rows={10}
                value={noteModalContent}
                onChange={e => setNoteModalContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") { e.stopPropagation(); setNoteModal(null); }
                  if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    if (!noteModalContent.trim()) return;
                    const updatedNotes = noteModal.allNotes.map(n =>
                      n.id === noteModal.note.id ? { ...n, content: noteModalContent.trim() } : n
                    );
                    onUpdate(noteModal.taskId, { notes: updatedNotes });
                    setNoteModal(null);
                  }
                }}
                autoFocus
              />
            </div>
            <div className={`flex justify-end gap-2 px-4 py-3 border-t ${TC.borderClass}`}>
              <button
                onClick={() => setNoteModal(null)}
                className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 ${TC.elevated} ${TC.textSec} hover:opacity-80 transition-colors`}
              >
                {t("note.cancel")}
                <kbd className={`text-xs px-1.5 py-0.5 rounded border ${TC.borderClass} opacity-60 font-mono`}>Esc</kbd>
              </button>
              <button
                onClick={() => {
                  if (!noteModalContent.trim()) return;
                  const updatedNotes = noteModal.allNotes.map(n =>
                    n.id === noteModal.note.id ? { ...n, content: noteModalContent.trim() } : n
                  );
                  onUpdate(noteModal.taskId, { notes: updatedNotes });
                  setNoteModal(null);
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                {t("note.save")}
                <kbd className="text-xs px-1.5 py-0.5 rounded border border-white/30 opacity-70 font-mono">Ctrl+↵</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso, format, locale) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  if (format === "dmy")   return `${d}-${m}-${y}`;
  if (format === "us")    return `${m}/${d}/${y}`;
  if (format === "short") return locale === "ru" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
  if (format === "long") {
    try {
      return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
        day: "numeric", month: "long", year: "numeric",
      }).format(new Date(`${iso}T12:00:00`));
    } catch { return iso; }
  }
  return iso; // "iso" (default)
}

function localIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(str) {
  const s = (str || "").trim().toLowerCase();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  // Natural language: today / сегодня
  if (s === "today" || s === "сегодня") return localIsoDate(new Date());
  // tomorrow / завтра
  if (s === "tomorrow" || s === "завтра") { const d = new Date(); d.setDate(d.getDate() + 1); return localIsoDate(d); }
  // yesterday / вчера
  if (s === "yesterday" || s === "вчера") { const d = new Date(); d.setDate(d.getDate() - 1); return localIsoDate(d); }
  // Relative: +3d (days), +2w (weeks), +1m (months)
  let m = s.match(/^\+(\d+)([dwm])$/);
  if (m) {
    const n = parseInt(m[1]);
    const d = new Date();
    if (m[2] === "d") d.setDate(d.getDate() + n);
    else if (m[2] === "w") d.setDate(d.getDate() + n * 7);
    else if (m[2] === "m") d.setMonth(d.getMonth() + n);
    return localIsoDate(d);
  }
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null; // unparseable
}

// Date input that shows the app's selected format but uses a native date picker
function DateField({ value, onChange, className }) {
  const { settings, locale, TC } = useApp();
  const fmt = settings?.dateFormat || "iso";
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${className} text-left flex items-center justify-between cursor-pointer`}
      >
        <span className={value ? "" : `${TC.textMuted}`}>{value ? fmtDate(value, fmt, locale) : "—"}</span>
        <Calendar size={13} className={`${TC.textMuted} opacity-60`} />
      </button>
      {open && (
        <DatePicker
          anchorRef={anchorRef}
          value={value || null}
          onChange={(iso) => { onChange(iso || ""); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ─── TaskEditDialog ───────────────────────────────────────────────────────────

function TaskEditDialog({ task, tasks: allTasks = [], onSave, onCancel }) {
  const { t, TC, lists, tags: allTags, flows, personas: allPersonas } = useApp();
  const [form, setForm] = useState({
    title:      task.title      || "",
    status:     task.status     || "inbox",
    priority:   task.priority   || 4,
    list:       task.list       || "",
    tags:       [...(task.tags     || [])],
    personas:   [...(task.personas || [])],
    due:        task.due        || "",
    dateStart:  task.dateStart  || "",
    recurrence: task.recurrence || "",
    url:        task.url        || "",
    estimate:   task.estimate   || "",
    flowId:     task.flowId     || "",
    dependsOn:  task.dependsOn  || "",
    notes:      [...(task.notes || [])],
  });
  // dependsOnText: displayed in input (title), form.dependsOn: stored (ID)
  const [dependsOnText, setDependsOnText] = useState(() =>
    task.dependsOn ? (allTasks.find(x => x.id === task.dependsOn)?.title || task.dependsOn) : ""
  );
  const taskOptions = allTasks
    .filter(x => x.id !== task.id)
    .map(x => ({ value: x.id, label: x.title }));
  const handleDependsOnChange = (v) => {
    const matched = allTasks.find(x => x.id === v);
    if (matched) {
      setDependsOnText(matched.title);
      setForm(f => ({ ...f, dependsOn: matched.id }));
    } else {
      setDependsOnText(v);
      const byTitle = allTasks.find(x => x.title.toLowerCase() === v.toLowerCase() && x.id !== task.id);
      setForm(f => ({ ...f, dependsOn: byTitle ? byTitle.id : "" }));
    }
  };
  const [tagInput,     setTagInput]     = useState("");
  const [personaInput, setPersonaInput] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null); // null = none, "new" = new note form
  const [noteContent, setNoteContent] = useState("");

  const startAdd  = () => { setNoteContent(""); setEditingNoteId("new"); };
  const startEdit = (note) => { setNoteContent(note.content || ""); setEditingNoteId(note.id); };
  const cancelNote = () => { setEditingNoteId(null); setNoteContent(""); };
  const saveNote = () => {
    if (!noteContent.trim()) return;
    if (editingNoteId === "new") {
      const newNote = { id: ulid(), title: "", content: noteContent.trim(), createdAt: new Date().toISOString() };
      set("notes", [...form.notes, newNote]);
    } else {
      set("notes", form.notes.map(n => n.id === editingNoteId ? { ...n, content: noteContent.trim() } : n));
    }
    cancelNote();
  };
  const deleteNote = (id) => set("notes", form.notes.filter(n => n.id !== id));

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addTag = (tag) => {
    const cleaned = tag.trim().replace(/^#/, "");
    if (cleaned && !form.tags.includes(cleaned)) set("tags", [...form.tags, cleaned]);
    setTagInput("");
  };
  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

  const addPersona = (p) => {
    const cleaned = p.trim().replace(/^\\/, "").replace(/\s+/g, "");
    if (cleaned && !form.personas.includes(cleaned)) set("personas", [...form.personas, cleaned]);
    setPersonaInput("");
  };
  const removePersona = (p) => set("personas", form.personas.filter(x => x !== p));

  const handleSave = () => {
    // Auto-flush any note currently open in the editor
    let finalNotes = form.notes;
    if (editingNoteId && noteContent.trim()) {
      if (editingNoteId === "new") {
        const newNote = { id: ulid(), title: "", content: noteContent.trim(), createdAt: new Date().toISOString() };
        finalNotes = [...form.notes, newNote];
      } else {
        finalNotes = form.notes.map(n => n.id === editingNoteId ? { ...n, content: noteContent.trim() } : n);
      }
    }
    const changes = {
      title:      form.title.trim()  || task.title,
      status:     form.status,
      priority:   Number(form.priority),
      list:       form.list.trim()       || null,
      tags:       form.tags,
      personas:   form.personas,
      due:        form.due               || null,
      dateStart:  form.dateStart         || null,
      recurrence: form.recurrence.trim() || null,
      url:        (() => { let u = form.url.trim(); if (!u) return null; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u) ? u : null; })(),
      estimate:   form.estimate.trim()   || null,
      flowId:     form.flowId.trim()     || null,
      dependsOn:  form.dependsOn.trim()  || null,
      notes:      finalNotes,
    };
    onSave(changes);
  };

  const inputCls = `w-full text-sm rounded-md px-3 py-1.5 border outline-none focus:ring-1 focus:ring-sky-500 ${TC.elevated} ${TC.text} ${TC.borderClass}`;
  const labelCls = `block text-xs mb-1 ${TC.textMuted}`;
  const sectionCls = `grid gap-3 mb-4`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onClick={onCancel}>
      <div className={`w-[520px] max-h-[90vh] flex flex-col rounded-xl shadow-2xl border ${TC.surface} ${TC.borderClass}`}
           onClick={e => e.stopPropagation()}
           onKeyDown={e => {
             if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
             else if (e.key === "Enter" && !["TEXTAREA","SELECT","BUTTON"].includes(e.target.tagName)) {
               e.preventDefault(); e.stopPropagation(); handleSave();
             }
           }}>

        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${TC.borderClass}`}>
          <h2 className={`text-sm font-semibold ${TC.text}`}>{t("edit.title")}</h2>
          <button onClick={onCancel} className={`p-1 rounded hover:opacity-70 ${TC.textMuted}`}><X size={16} /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className={labelCls}>{t("edit.field.title")}</label>
            <input className={inputCls} value={form.title}
              onChange={e => set("title", e.target.value)}
              autoFocus />
          </div>

          {/* Status + Priority */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.status")}</label>
              <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{t("status." + s)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.priority")}</label>
              <div className="flex gap-1">
                {[1,2,3,4].map(p => (
                  <button key={p} onClick={() => set("priority", p)}
                    style={{ background: form.priority === p ? PRIORITY_COLORS[p] : "transparent",
                             border: `1px solid ${PRIORITY_COLORS[p]}`, color: form.priority === p ? "#fff" : PRIORITY_COLORS[p] }}
                    className="flex-1 text-xs font-bold rounded py-1.5 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List + Due */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.list")}</label>
              <Combobox
                className={inputCls}
                value={form.list}
                onChange={v => set("list", v)}
                options={lists}
                placeholder={t("edit.newList")}
              />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.due")}</label>
              <DateField className={inputCls} value={form.due} onChange={v => set("due", v)} />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>{t("edit.field.tags")}</label>
            <div className={`flex flex-wrap gap-1.5 p-2 rounded-md border min-h-[36px] ${TC.elevated} ${TC.borderClass}`}>
              {form.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs text-sky-400 bg-sky-400/10 border border-sky-400/30 px-2 py-0.5 rounded-full">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors"><X size={10} /></button>
                </span>
              ))}
              <Combobox
                className={`text-xs bg-transparent outline-none min-w-[100px] flex-1 ${TC.text}`}
                value={tagInput}
                onChange={setTagInput}
                onCommit={addTag}
                options={allTags}
                placeholder={t("edit.addTag")}
                onKeyDown={e => {
                  if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); e.stopPropagation(); addTag(tagInput); return; }
                  if (e.key === "Backspace" && !tagInput && form.tags.length) removeTag(form.tags[form.tags.length - 1]);
                }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              />
            </div>
          </div>

          {/* Personas */}
          <div>
            <label className={labelCls}>{t("edit.field.personas")}</label>
            <div className={`flex flex-wrap gap-1.5 p-2 rounded-md border min-h-[36px] ${TC.elevated} ${TC.borderClass}`}>
              {form.personas.map(p => (
                <span key={p} className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  <User size={9} />{p}
                  <button onClick={() => removePersona(p)} className="hover:text-red-400 transition-colors"><X size={10} /></button>
                </span>
              ))}
              <Combobox
                className={`text-xs bg-transparent outline-none min-w-[100px] flex-1 ${TC.text}`}
                value={personaInput}
                onChange={v => setPersonaInput(v.replace(/\s/g, ""))}
                onCommit={addPersona}
                options={allPersonas}
                placeholder={t("edit.addPersona")}
                onKeyDown={e => {
                  if ((e.key === "Enter" || e.key === ",") && personaInput.trim()) { e.preventDefault(); e.stopPropagation(); addPersona(personaInput); return; }
                  if (e.key === "Backspace" && !personaInput && form.personas.length) removePersona(form.personas[form.personas.length - 1]);
                }}
                onBlur={() => { if (personaInput.trim()) addPersona(personaInput); }}
              />
            </div>
          </div>

          {/* Start date + Recurrence */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.dateStart")}</label>
              <DateField className={inputCls} value={form.dateStart} onChange={v => set("dateStart", v)} />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.recurrence")}</label>
              <Combobox
                className={inputCls}
                value={form.recurrence}
                onChange={v => set("recurrence", v)}
                options={["daily","weekly","monthly","FREQ=DAILY","FREQ=WEEKLY;INTERVAL=1","FREQ=MONTHLY;INTERVAL=1","FREQ=YEARLY;INTERVAL=1"]}
                placeholder="daily / weekly / FREQ=…"
              />
            </div>
          </div>

          {/* URL + Estimate */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.url")}</label>
              <input className={inputCls} type="url" value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.estimate")}</label>
              <input className={inputCls} value={form.estimate} onChange={e => set("estimate", e.target.value)} placeholder="1 hour / 30 min" />
            </div>
          </div>

          {/* Flow + Depends on */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.flow")}</label>
              <Combobox
                className={inputCls}
                value={form.flowId}
                onChange={v => set("flowId", v)}
                options={flows}
              />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.dependsOn")}</label>
              <Combobox
                value={dependsOnText}
                onChange={handleDependsOnChange}
                options={taskOptions}
                placeholder={t("edit.field.dependsOn") + "…"}
                className={inputCls}
              />
            </div>
          </div>

          {/* Notes editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>{t("detail.notes")}{form.notes.length > 0 ? ` (${form.notes.length})` : ""}</label>
              {editingNoteId === null && (
                <button onClick={startAdd} type="button"
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors">
                  <Plus size={11} />{t("note.add")}
                </button>
              )}
            </div>

            {/* Existing notes */}
            <div className="space-y-2">
              {form.notes.map(note => (
                <div key={note.id}>
                  {editingNoteId === note.id ? (
                    <div className={`rounded-md p-2 border ${TC.elevated} ${TC.borderClass}`}>
                      <textarea
                        className={`w-full text-xs bg-transparent outline-none focus:outline-none resize-none ${TC.text} placeholder:opacity-40`}
                        rows={4}
                        value={noteContent}
                        onChange={e => setNoteContent(e.target.value)}
                        placeholder={t("note.content")}
                        autoFocus
                      />
                      <div className="flex gap-1.5 mt-1.5">
                        <button onClick={saveNote} type="button" className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors">{t("note.save")}</button>
                        <button onClick={cancelNote} type="button" className={`text-xs px-2 py-0.5 rounded ${TC.elevated} ${TC.textMuted} hover:opacity-80 transition-colors`}>{t("note.cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group rounded-md p-2 text-xs border cursor-pointer ${TC.elevated} ${TC.borderClass} hover:border-sky-500/50 transition-colors`}
                      onClick={() => startEdit(note)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(note); } }}
                      tabIndex={0}
                      role="button"
                      aria-label={t("note.edit")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`whitespace-pre-wrap leading-relaxed ${TC.textMuted}`}>{note.content}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                            type="button"
                            className={`${TC.textMuted} hover:text-red-400 transition-colors`}
                            title={t("note.delete")}
                          ><X size={11} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* New note form */}
            {editingNoteId === "new" && (
              <div className={`rounded-md p-2 border mt-2 ${TC.elevated} ${TC.borderClass}`}>
                <textarea
                  className={`w-full text-xs bg-transparent outline-none focus:outline-none resize-none ${TC.text} placeholder:opacity-40`}
                  rows={4}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder={t("note.content")}
                  autoFocus
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={saveNote} type="button" className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors">{t("note.save")}</button>
                  <button onClick={cancelNote} type="button" className={`text-xs px-2 py-0.5 rounded ${TC.elevated} ${TC.textMuted} hover:opacity-80 transition-colors`}>{t("note.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-2 justify-end px-6 py-4 border-t flex-shrink-0 ${TC.borderClass}`}>
          <button onClick={onCancel}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${TC.elevated} ${TC.textSec} hover:opacity-80`}>
            {t("confirm.cancel")}
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
            {t("edit.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RtmImportDialog ──────────────────────────────────────────────────────────

function RtmImportDialog({ data, onConfirm, onCancel }) {
  const { t, TC } = useApp();
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const activeCount    = (data.tasks || []).filter(rt => !rt.date_completed && !rt.date_trashed).length;
  const completedCount = (data.tasks || []).length - activeCount;
  const toImportCount  = includeCompleted ? (data.tasks || []).length : activeCount;

  const warnings = [
    `${(data.locations || []).length} ${t("rtm.skipLocations")}`,
    `${(data.smart_lists || []).length} ${t("rtm.skipSmartLists")}`,
    t("rtm.skipSubtasks"),
    t("rtm.skipSource"),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-96 rounded-xl p-6 shadow-2xl border ${TC.surface} ${TC.borderClass}`}>
        <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("rtm.dialogTitle")}</h2>

        {/* Summary */}
        <div className={`rounded-lg p-3 mb-4 text-sm space-y-1 ${TC.elevated}`}>
          <div className={TC.text}>{t("rtm.tasks")}: <span className="text-sky-400">{activeCount} {t("rtm.active")}</span> + <span className={TC.textMuted}>{completedCount} {t("rtm.completed")}</span></div>
          <div className={TC.text}>{t("rtm.lists")}: <span className="text-emerald-400">{(data.lists || []).length}</span></div>
          <div className={TC.text}>{t("rtm.tags")}: <span className="text-sky-400">{(data.tags || []).length}</span></div>
          <div className={TC.text}>{t("rtm.notes")}: <span className="text-violet-400">{(data.notes || []).length}</span></div>
        </div>

        {/* Option */}
        <label className={`flex items-center gap-2 mb-4 text-sm cursor-pointer ${TC.text}`}>
          <input type="checkbox" checked={includeCompleted} onChange={e => setIncludeCompleted(e.target.checked)} className="rounded" />
          {t("rtm.includeCompleted")}
        </label>

        {/* Warnings */}
        <div className={`rounded-lg p-3 mb-4 text-xs space-y-1 border ${TC.borderClass}`}>
          <p className={`font-medium mb-1 ${TC.textMuted}`}>{t("rtm.skippedTitle")}</p>
          {warnings.map((w, i) => <p key={i} className="text-yellow-400/80">⚠ {w}</p>)}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className={`px-4 py-2 rounded text-sm transition-colors ${TC.elevated} ${TC.text} hover:opacity-80`}>
            {t("confirm.cancel")}
          </button>
          <button onClick={() => onConfirm(includeCompleted)}
            className="px-4 py-2 rounded text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors">
            {t("rtm.doImport")} {toImportCount} {t("rtm.records")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ImportProgressOverlay ────────────────────────────────────────────────────

function ImportProgressOverlay({ current, total }) {
  const { t, TC } = useApp();
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={`w-80 rounded-xl p-6 shadow-2xl border ${TC.surface} ${TC.borderClass}`}>
        <div className={`text-sm font-semibold mb-4 text-center ${TC.text}`}>
          {t("rtm.importing")}
        </div>
        {/* Progress bar */}
        <div className={`w-full h-2 rounded-full mb-3 overflow-hidden ${TC.elevated}`}>
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Counter */}
        <div className={`text-xs text-center mb-3 ${TC.textMuted}`}>
          {current} {t("rtm.importProgressOf")} {total} {t("rtm.importTasks")}
        </div>
        {/* Hint */}
        <div className={`text-xs text-center opacity-50 ${TC.textMuted}`}>
          {t("rtm.importPleaseWait")}
        </div>
      </div>
    </div>
  );
}


// ─── SortBar ──────────────────────────────────────────────────────────────────

function SortBar({ sort, onToggle, completionFilter, onCycleCompletion }) {
  const { t, TC } = useApp();
  const cfActive = completionFilter !== "all";
  const cfStyle = cfActive ? (completionFilter === "done"
    ? { background: "rgba(148,163,184,.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,.3)" }
    : { background: "rgba(34,197,94,.15)",   color: "#86efac", border: "1px solid rgba(34,197,94,.35)" }
  ) : undefined;
  return (
    <div data-guide="sort-filter" className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-1 flex-wrap">
        <span className={`text-xs mr-1 ${TC.textMuted}`}>{t("sort.label")}</span>
        {SORT_FIELDS.map(key => {
          const active = sort !== null && sort.field === key;
          return (
            <button key={key} onClick={() => onToggle(key)}
              style={{
                background: active ? "rgba(14,165,233,.15)" : undefined,
                color:      active ? "#7dd3fc" : undefined,
                border:     active ? "1px solid rgba(14,165,233,.35)" : undefined,
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
                ${active ? "" : `${TC.elevated} ${TC.textSec} border border-transparent`}`}
            >
              {t("sort." + key)}
              {active && <span style={{ fontSize: 10, lineHeight: 1 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-xs mr-1 ${TC.textMuted}`}>{t("cf.label")}</span>
        <button onClick={onCycleCompletion}
          style={cfStyle}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
            ${cfActive ? "" : `${TC.elevated} ${TC.textSec} border border-transparent`}`}
        >
          {t("cf." + completionFilter)}
        </button>
      </div>
    </div>
  );
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function StatusBar({ tasks, lastAction, canUndo, clockFormat, dateFormat, dbPath }) {
  const { t, TC, locale } = useApp();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayISO = now.toISOString().slice(0, 10);
  const dateStr = fmtDate(todayISO, dateFormat, locale);

  const totalCount = tasks.length;
  const activeToday = tasks.filter(tk => tk.status === "active" && (!tk.due || tk.due <= todayISO)).length;
  const doneToday = tasks.filter(tk => tk.status === "done" && tk.completedAt && tk.completedAt.slice(0, 10) === todayISO).length;
  const overdueCount = tasks.filter(tk => tk.due && tk.due < todayISO && tk.status !== "done" && tk.status !== "cancelled").length;

  const progressTotal = activeToday + doneToday;
  const progressPct = progressTotal > 0 ? Math.round(doneToday / progressTotal * 100) : 0;

  return (
    <div className={`flex items-center gap-2 px-4 py-1 text-[10px] flex-shrink-0 border-t select-none overflow-hidden whitespace-nowrap min-h-0 ${TC.borderClass} ${TC.textMuted}`}>
      {/* DB path */}
      <span title={dbPath || "tasks.db"} className="flex items-center gap-1 opacity-50">
        <HardDrive size={10} className="flex-shrink-0" />
        <span className="truncate max-w-[80px]">{(dbPath || "tasks.db").replace(/^.*[/\\]/, "")}</span>
      </span>

      {/* Date */}
      <span className="opacity-60">{dateStr}</span>

      <span className="opacity-30">|</span>

      {/* Task counters */}
      <span>{totalCount} {t("sb.total")}</span>
      <span>{activeToday} {t("sb.active")}</span>
      <span className="text-green-400">{doneToday} {t("sb.doneToday")}</span>
      {overdueCount > 0 && <span className="text-red-400">{overdueCount} {t("sb.overdue")}</span>}

      {/* Progress bar */}
      {progressTotal > 0 && (
        <span className="flex items-center gap-1">
          <span className="inline-block w-[60px] h-[4px] rounded-full bg-slate-700 overflow-hidden">
            <span className="block h-full rounded-full bg-green-500 transition-all" style={{ width: `${progressPct}%` }} />
          </span>
          <span className="text-green-400">{progressPct}%</span>
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Last action + undo hint */}
      {lastAction && (
        <span className="truncate max-w-[250px] opacity-70" title={lastAction}>{lastAction}</span>
      )}
      {lastAction && canUndo && (
        <span className="opacity-40 mx-0.5">·</span>
      )}
      {canUndo && (
        <span className="opacity-50 text-sky-400">Ctrl+Z — Undo</span>
      )}
    </div>
  );
}

// ─── UI Guide (onboarding) ───────────────────────────────────────────────────

const GUIDE_STEPS = [
  { target: "sidebar",      titleKey: "guide.step.sidebar.title",      descKey: "guide.step.sidebar.desc" },
  { target: "search",       titleKey: "guide.step.search.title",       descKey: "guide.step.search.desc" },
  { target: "create-task",  titleKey: "guide.step.createTask.title",   descKey: "guide.step.createTask.desc" },
  { target: "sort-filter",  titleKey: "guide.step.sortFilter.title",   descKey: "guide.step.sortFilter.desc" },
  { target: "task-row",     titleKey: "guide.step.taskRow.title",      descKey: "guide.step.taskRow.desc" },
  { target: "detail-panel", titleKey: "guide.step.detailPanel.title",  descKey: "guide.step.detailPanel.desc" },
];

function GuideOverlay({ step, total, target, titleKey, descKey, onNext, onBack, onSkip }) {
  const { t, TC } = useApp();
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const recalc = () => {
      const el = document.querySelector(`[data-guide="${target}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [target]);

  if (!rect) return null;

  const pad = 8;
  const cx = rect.left - pad;
  const cy = rect.top - pad;
  const cw = rect.width + pad * 2;
  const ch = rect.height + pad * 2;

  // Smart tooltip positioning: try bottom → top → right → left
  const tipW = 320;
  const tipH = 180; // estimated height
  const tipGap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let tipStyle = {};
  const spaceBottom = vh - (cy + ch);
  const spaceTop = cy;
  const spaceRight = vw - (cx + cw);
  const spaceLeft = cx;

  if (spaceBottom >= tipH + tipGap) {
    // Place below
    tipStyle = { top: cy + ch + tipGap, left: Math.max(8, Math.min(cx, vw - tipW - 8)) };
  } else if (spaceTop >= tipH + tipGap) {
    // Place above
    tipStyle = { top: cy - tipGap - tipH, left: Math.max(8, Math.min(cx, vw - tipW - 8)) };
  } else if (spaceRight >= tipW + tipGap) {
    // Place to the right
    tipStyle = { left: cx + cw + tipGap, top: Math.max(8, Math.min(cy, vh - tipH - 8)) };
  } else if (spaceLeft >= tipW + tipGap) {
    // Place to the left
    tipStyle = { left: cx - tipW - tipGap, top: Math.max(8, Math.min(cy, vh - tipH - 8)) };
  } else {
    // Fallback: center of screen
    tipStyle = { left: (vw - tipW) / 2, top: Math.max(8, vh - tipH - 16) };
  }

  const isFirst = step === 0;
  const isLast = step === total - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      {/* SVG overlay with cutout mask */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="guide-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={cx} y={cy} width={cw} height={ch} rx={8} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#guide-mask)" />
      </svg>

      {/* Highlight border around target */}
      <div style={{
        position: "absolute", left: cx, top: cy, width: cw, height: ch,
        borderRadius: 8, border: "2px solid rgba(14,165,233,0.6)",
        boxShadow: "0 0 0 4px rgba(14,165,233,0.15)",
        pointerEvents: "none",
      }} />

      {/* Tooltip card */}
      <div
        style={{ position: "absolute", width: tipW, ...tipStyle }}
        className="rounded-xl shadow-2xl border border-slate-600 p-4 bg-slate-800 text-slate-100"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">
            {step + 1} {t("guide.stepOf")} {total}
          </span>
          <button onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            {t("guide.skip")}
          </button>
        </div>
        <h3 className="text-sm font-semibold mb-1 text-white">{t(titleKey)}</h3>
        <p className="text-xs leading-relaxed mb-4 text-slate-300">{t(descKey)}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            disabled={isFirst}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
              ${isFirst ? "opacity-30 cursor-default text-slate-500" : "text-slate-300 hover:bg-slate-700"}`}
          >
            {t("guide.back")}
          </button>
          <button
            onClick={onNext}
            className="px-4 py-1.5 text-xs rounded-lg font-medium bg-sky-600 text-white hover:bg-sky-500 transition-colors"
          >
            {isLast ? t("guide.done") : t("guide.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettingsState] = useState(() => {
    try {
      const saved = localStorage.getItem("to_settings");
      const def = { firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal", condense: false, colorTheme: "default", clockFormat: "24h", newTaskActiveToday: false };
      return saved ? { ...def, ...JSON.parse(saved) } : def;
    } catch { return { firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal", condense: false, colorTheme: "default", clockFormat: "24h", newTaskActiveToday: false }; }
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
  const [filters, setFilters] = useState({ status: null, dateRange: null, list: null, tag: null, flow: null, persona: null });
  const syncCompletionFilter = (statusValue) => {
    const cf = statusValue === "active" ? "active" : statusValue === "done" ? "done" : "all";
    setCompletionFilter(cf);
    localStorage.setItem("completionFilter", cf);
  };
  const setFilter = (key, value) => {
    const newValue = filters[key] === value ? null : value;
    setFilters(f => ({ ...f, [key]: newValue }));
    if (key === "dateRange") setCalendarFilter(null);
    if (key === "status") syncCompletionFilter(newValue);
  };
  const setFilterForce = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    if (key === "dateRange") setCalendarFilter(null);
    if (key === "status") syncCompletionFilter(value);
  };
  const clearFilter = (key) => setFilters(f => ({ ...f, [key]: null }));
  const clearAllFilters = () => { setFilters({ status: null, dateRange: null, list: null, tag: null, flow: null, persona: null }); syncCompletionFilter(null); };
  // Backward-compat helpers
  const hasAnyFilter = Object.values(filters).some(v => v !== null);
  const [searchQuery, setSearchQuery]   = useState("");
  const [toasts, setToasts] = useState([]);
  const [showSidebar, setShowSidebar]       = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showCalendar, setShowCalendar]     = useState(true);
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
  const [completionFilter, setCompletionFilter] = useState(() => localStorage.getItem("completionFilter") || "all");

  const cycleCompletionFilter = () => {
    setCompletionFilter(cf => {
      const next = cf === "all" ? "active" : cf === "active" ? "done" : "all";
      localStorage.setItem("completionFilter", next);
      // Sync sidebar status filter
      setFilters(f => ({ ...f, status: next === "all" ? null : next }));
      return next;
    });
  };

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
      const todayStr = new Date().toISOString().slice(0, 10);
      const isPastDue = tt => tt.due && tt.due < todayStr && tt.status !== "done" && tt.status !== "cancelled";
      const v = filters.dateRange;
      if (v === "overdue") r = r.filter(isPastDue);
      else if (v === "today") r = r.filter(tt => tt.due === todayStr || isPastDue(tt));
      else if (v === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); const tom = d.toISOString().slice(0, 10); r = r.filter(tt => tt.due === tom || isPastDue(tt)); }
      else if (v === "week") { const d = new Date(); d.setDate(d.getDate() + 7); const max = d.toISOString().slice(0, 10); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
      else if (v === "month") { const d = new Date(); d.setDate(d.getDate() + 30); const max = d.toISOString().slice(0, 10); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
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
    // completionFilter is synced with filters.status — filtering happens via filters.status above

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
  }, [tasks, filters, searchQuery, calendarFilter, sort, locale, completionFilter]);

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
      const wasDrag = didDragRef.current;
      dragStartRef.current = null;
      setDragRect(null);
      // didDragRef stays true until the subsequent click event clears it
      if (wasDrag) {
        // Move focus to task list sentinel so keyboard shortcuts (Del, Space, arrows) work immediately
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
        if (contextMenu)       { setContextMenu(null); return; }
        if (editTaskId)        setEditTaskId(null);
        else if (selected.size > 0) setSelected(new Set());
        else if (searchQuery)  setSearchQuery("");
        else                   clearAllFilters();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [filtered, cursor, selected, lastIdx, store.canUndo, tasks, searchQuery, locale, editTaskId, contextMenu]);

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

  const handleAdd = (taskData) => {
    if (settings.newTaskActiveToday && !taskData.status) {
      const today = new Date().toISOString().slice(0, 10);
      store.addTask({ ...taskData, status: "active", due: taskData.due || today }, tasks);
    } else {
      store.addTask(taskData, tasks);
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
            <div className="w-8 h-8 bg-gradient-to-br from-sky-500 to-violet-500 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <h1 className={`text-lg font-semibold tracking-tight ${TC.text}`}>Task Orchestrator</h1>
            <button
              onClick={() => setShowSidebar(v => !v)}
              title={showSidebar ? t("hdr.hideLeft") : t("hdr.showLeft")}
              className={`p-1.5 rounded-md transition-colors ${showSidebar ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg}`}`}
            >
              <PanelLeftIcon size={18} active={showSidebar} />
            </button>
          </div>

          <div data-guide="search" className="flex-1 max-w-md relative">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${TC.textMuted}`} />
            <input
              id="search-input"
              autoComplete="off"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("hdr.search")}
              className={`w-full border rounded-lg pl-9 pr-8 py-1.5 text-sm outline-none focus:border-sky-500 transition-colors ${TC.input} ${TC.inputText}`}
              onKeyDown={e => {
                if (e.key === "Escape") { e.stopPropagation(); setSearchQuery(""); e.target.blur(); return; }
                if (e.key !== "Tab") return;
                e.preventDefault();
                document.getElementById(e.shiftKey ? "task-list" : "quick-entry")?.focus();
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className={`absolute right-2 top-1/2 -translate-y-1/2 ${TC.textMuted} hover:text-gray-300`}>
                <X size={14} />
              </button>
            )}
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
            <SortBar sort={sort} onToggle={toggleSort} completionFilter={completionFilter} onCycleCompletion={cycleCompletionFilter} />

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
                      <TaskRow
                        key={task.id}
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
          <StatusBar tasks={tasks} lastAction={lastAction} canUndo={store.canUndo} clockFormat={settings.clockFormat} dateFormat={settings.dateFormat} dbPath={store.dbPath} />
          </div>

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
              setCompletionFilter("all");
              localStorage.setItem("completionFilter", "all");
            }}
            dbPath={store.dbPath}
            onRevealDb={store.revealDb}
            onOpenDb={async () => { const ok = await store.openNewDb(); if (ok) setShowDbSwitched(true); }}
            onMoveDb={store.moveCurrentDb}
            onRestartGuide={() => {
              setGuideStep(0);
              saveMetaRef.current?.("to_guide_completed", "false");
            }}
            onCreateBackup={store.createBackup}
            onListBackups={store.listBackups}
            onRestoreBackup={store.restoreBackup}
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
