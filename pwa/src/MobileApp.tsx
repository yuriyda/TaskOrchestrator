/**
 * @file MobileApp.jsx — mobile-first layout for PWA.
 * Reuses shared logic (i18n, themes, constants, date utils) from the desktop app
 * but provides a completely different layout optimized for touch screens.
 *
 * Layout: single-column, full-width task list, drawer sidebar, bottom sheet
 * for task creation, full-screen detail view on tap.
 */

import { useCallback, useMemo } from 'react'
import { STATUSES, PRIORITY_COLORS } from '@shared/core/constants.js'
import { localIsoDate, parseDateInput, fmtDate } from '@shared/core/date.js'
import { overdueLevel } from '@shared/core/overdue.js'
import { humanRecurrence } from '@shared/core/recurrence.js'
import {
  Plus, Search, Menu, X, ChevronRight, ChevronLeft,
  Inbox, Zap, CheckCircle2, Ban, Circle, Repeat,
  Trash2, Calendar, Flag, List, Hash, ArrowUp, ArrowDown,
  Filter, Settings, ChevronDown, RefreshCw, Save, Edit3,
  AlertTriangle, StickyNote, ExternalLink,
} from 'lucide-react'

import { MobileCalendar } from './ui/MobileCalendar'
import { Drawer } from './ui/Drawer'
import { FilterBar } from './ui/FilterBar'
import { AgendaBar } from './ui/AgendaBar'
import { TaskItem } from './ui/TaskItem'
import { TaskDetail } from './ui/TaskDetail'
import { AddTaskSheet } from './ui/AddTaskSheet'
import { SearchBar } from './ui/SearchBar'
import { MobileSettingsScreen } from './ui/MobileSettingsScreen'
import { MobileDrawerContent } from './ui/MobileDrawerContent'
import { MobileHeader } from './ui/MobileHeader'
import { MobileTaskList } from './ui/MobileTaskList'
import { MobileToasts } from './ui/MobileToasts'
import { useMobileFilters } from './hooks/useMobileFilters'
import { useMobileDialogs } from './hooks/useMobileDialogs'
import { useMobileUpdateCheck } from './hooks/useMobileUpdateCheck'
import { useMobileSync } from './hooks/useMobileSync'
import { useMobileLocale } from './hooks/useMobileLocale'
import { useMobileUndo } from './hooks/useMobileUndo'

// ─── Main Mobile App ──────────────────────────────────────────────────────────

interface MobileAppProps {
  store: any; // BrowserTaskStore — typed when browserStore.ts is fully typed
}

export default function MobileApp({ store }: MobileAppProps) {
  const { locale, setLocale, t } = useMobileLocale()

  const {
    filter, setFilter,
    dateRange, setDateRange,
    listFilter, setListFilter,
    tagFilter, setTagFilter,
    searchQuery, setSearchQuery,
    searchVisible, setSearchVisible,
    calendarDate, setCalendarDate,
    actualOnly, toggleActualOnly,
    groupByFlow, toggleGroupByFlow,
  } = useMobileFilters()
  const {
    drawerOpen, setDrawerOpen,
    showAdd, setShowAdd,
    detailId, setDetailId,
    showCalendar, setShowCalendar,
    showSettings, setShowSettings,
  } = useMobileDialogs()
  const {
    gdriveConnected, setGdriveConnected,
    showGdriveSetup, setShowGdriveSetup,
    gdriveClientId, setGdriveClientId,
    gdriveClientSecret, setGdriveClientSecret,
    autoSyncing,
    manualSyncing,
    syncError,
    syncMsg, setSyncMsg,
    syncLog, addSyncLog, setSyncLog,
    lastSync,
    handleSyncNow,
  } = useMobileSync(store, t, locale)
  const autoSyncEnabled = store.metaSettings?.pwa_auto_sync !== 'false'
  const { undoAction, showUndo, clearUndo } = useMobileUndo()
  const [updateMsg, setUpdateMsg] = useMobileUpdateCheck(locale)

  const { tasks } = store
  const today = localIsoDate(new Date())

  const isPastDue = useCallback((tt) => tt.due && tt.due < today && tt.status !== 'done' && tt.status !== 'cancelled', [today])

  // Agenda counts (same logic as desktop Sidebar)
  const agendaCounts = useMemo(() => {
    const d1 = new Date(); d1.setDate(d1.getDate() + 1)
    const tom = localIsoDate(d1)
    const d7 = new Date(); d7.setDate(d7.getDate() + 7)
    const max7 = localIsoDate(d7)
    const d30 = new Date(); d30.setDate(d30.getDate() + 30)
    const max30 = localIsoDate(d30)
    return {
      overdue:  tasks.filter(isPastDue).length,
      today:    tasks.filter(tt => tt.due === today || isPastDue(tt)).length,
      tomorrow: tasks.filter(tt => tt.due === tom || isPastDue(tt)).length,
      week:     tasks.filter(tt => (tt.due && tt.due >= today && tt.due <= max7) || isPastDue(tt)).length,
      month:    tasks.filter(tt => (tt.due && tt.due >= today && tt.due <= max30) || isPastDue(tt)).length,
    }
  }, [tasks, today, isPastDue])

  // Filtered + searched tasks (desktop-matching logic)
  const filtered = useMemo(() => {
    let r = tasks
    if (filter) r = r.filter(t => t.status === filter)
    else if (actualOnly) r = r.filter(t => t.status !== 'done' && t.status !== 'cancelled')
    if (dateRange) {
      if (dateRange === 'overdue') r = r.filter(isPastDue)
      else if (dateRange === 'today') r = r.filter(tt => tt.due === today || isPastDue(tt))
      else if (dateRange === 'tomorrow') {
        const d = new Date(); d.setDate(d.getDate() + 1); const tom = localIsoDate(d)
        r = r.filter(tt => tt.due === tom || isPastDue(tt))
      } else if (dateRange === 'week') {
        const d = new Date(); d.setDate(d.getDate() + 7); const max = localIsoDate(d)
        r = r.filter(tt => (tt.due && tt.due >= today && tt.due <= max) || isPastDue(tt))
      } else if (dateRange === 'month') {
        const d = new Date(); d.setDate(d.getDate() + 30); const max = localIsoDate(d)
        r = r.filter(tt => (tt.due && tt.due >= today && tt.due <= max) || isPastDue(tt))
      }
    }
    if (listFilter) r = r.filter(t => t.list === listFilter)
    if (tagFilter) r = r.filter(t => t.tags?.includes(tagFilter))
    if (calendarDate) r = r.filter(t => t.due === calendarDate)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      r = r.filter(t => t.title.toLowerCase().includes(q))
    }
    return r
  }, [tasks, filter, dateRange, listFilter, tagFilter, calendarDate, searchQuery, today, isPastDue, actualOnly])

  // Regular (non-overdue) tasks, reordered by flow when groupByFlow is on.
  const regularReordered = useMemo(() => {
    const rest = filtered.filter(t => !isPastDue(t))
    if (!groupByFlow) return rest
    const seen = new Set<string>()
    const grouped: typeof rest = []
    for (const task of rest) {
      if (task.flowId) {
        if (seen.has(task.flowId)) continue
        seen.add(task.flowId)
        grouped.push(...rest.filter(t => t.flowId === task.flowId))
      } else {
        grouped.push(task)
      }
    }
    return grouped
  }, [filtered, groupByFlow, isPastDue])

  // Counts
  const counts = useMemo(() => ({
    all: tasks.length,
    inbox: tasks.filter(t => t.status === 'inbox').length,
    active: tasks.filter(t => t.status === 'active').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  // Overdue tasks float to top (not subject to flow grouping)
  const overdueTasks = useMemo(() =>
    filtered.filter(t => isPastDue(t)),
    [filtered, isPastDue]
  )
  const regularTasks = regularReordered

  const handleCycle = useCallback((id) => {
    store.bulkCycle(new Set([id]))
    // bulkCycle may transition to done (fan-out) OR to a benign next status;
    // we can't know the next status synchronously, so show a notification-only
    // toast. Undo would be partial at best, so no button.
    showUndo(locale === 'ru' ? 'Статус переключён' : 'Status cycled', null)
  }, [store, locale, showUndo])

  const handleAdd = useCallback((data) => {
    const d = { ...data }
    // Apply active filters as defaults so the new task stays in the current view
    if (!d.due && dateRange) {
      if (dateRange === 'today' || dateRange === 'overdue') d.due = today
      else if (dateRange === 'tomorrow') { const dt = new Date(); dt.setDate(dt.getDate() + 1); d.due = localIsoDate(dt) }
      else if (dateRange === 'week') { const dt = new Date(); dt.setDate(dt.getDate() + 7); d.due = localIsoDate(dt) }
      else if (dateRange === 'month') { const dt = new Date(); dt.setDate(dt.getDate() + 30); d.due = localIsoDate(dt) }
    }
    if (filter === 'active' && (!d.status || d.status === 'inbox')) d.status = 'active'
    if (!d.list && listFilter) d.list = listFilter
    if (tagFilter && (!d.tags || !d.tags.includes(tagFilter))) d.tags = [...(d.tags || []), tagFilter]
    store.addTask(d)
  }, [store, filter, dateRange, listFilter, tagFilter, today])

  const handleComplete = useCallback((id) => {
    // Completion has fan-out: handleTaskDone may spawn a recurring occurrence
    // and activate blocked dependents. A simple "restore prevStatus" Undo does
    // NOT roll those back, so we skip the Undo button here.
    store.bulkStatus(new Set([id]), 'done')
    showUndo(locale === 'ru' ? 'Задача завершена' : 'Task completed', null)
  }, [store, locale, showUndo])

  const handleDelete = useCallback((id) => {
    store.bulkDelete(new Set([id]))
    showUndo(
      locale === 'ru' ? 'Задача удалена' : 'Task deleted',
      () => store.updateTask(id, { deletedAt: null })
    )
  }, [store, locale, showUndo])

  const detailTask = detailId ? tasks.find(t => t.id === detailId) : null

  // ── Settings screen ────────────────────────────────────────────────────
  if (showSettings) {
    return (
      <MobileSettingsScreen
        locale={locale}
        setLocale={setLocale}
        store={store}
        gdriveConnected={gdriveConnected}
        autoSyncEnabled={autoSyncEnabled}
        updateMsg={updateMsg}
        onClose={() => setShowSettings(false)}
      />
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (detailTask) {
    return <TaskDetail task={detailTask} store={store} onBack={() => setDetailId(null)}
      onToast={(label, undoFn) => showUndo(label, undoFn ?? null)} locale={locale} t={t} />
  }

  // ── Main list view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-900" data-testid="mobile-app">
      <MobileHeader locale={locale} t={t} counts={counts}
        searchVisible={searchVisible} searchQuery={searchQuery} setSearchVisible={setSearchVisible}
        onOpenDrawer={() => setDrawerOpen(true)}
        syncMsg={syncMsg} setSyncMsg={setSyncMsg} handleSyncNow={handleSyncNow}
        autoSyncing={autoSyncing} manualSyncing={manualSyncing} syncError={syncError}
        gdriveConnected={gdriveConnected}
        syncEnabledOnStore={!!store.gdriveSyncNow} lastSync={lastSync} />

      {(searchVisible || searchQuery) && (
        <SearchBar query={searchQuery} onChange={v => { setSearchQuery(v); if (!v) setSearchVisible(false) }} t={t} />
      )}

      <FilterBar filter={filter} onFilter={setFilter} counts={counts}
        actualOnly={actualOnly} onToggleActualOnly={toggleActualOnly}
        groupByFlow={groupByFlow} onToggleGroupByFlow={toggleGroupByFlow}
        hasFlowTasks={filtered.some(tk => tk.flowId)} t={t} />
      <AgendaBar dateRange={dateRange} onDateRange={setDateRange} agendaCounts={agendaCounts} t={t} />
      {(listFilter || tagFilter) && (
        <div className="flex items-center gap-1.5 px-4 py-1.5">
          {listFilter && (
            <button onClick={() => setListFilter(null)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              @{listFilter} <X size={10} />
            </button>
          )}
          {tagFilter && (
            <button onClick={() => setTagFilter(null)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">
              #{tagFilter} <X size={10} />
            </button>
          )}
        </div>
      )}

      <MobileTaskList t={t} locale={locale} filtered={filtered}
        overdueTasks={overdueTasks} regularTasks={regularTasks} searchQuery={searchQuery}
        groupByFlow={groupByFlow} flowMeta={store.flowMeta || {}}
        onTap={setDetailId} onCycle={handleCycle} onComplete={handleComplete} onDelete={handleDelete} />

      <MobileToasts locale={locale} updateMsg={updateMsg} setUpdateMsg={setUpdateMsg}
        undoAction={undoAction} clearUndo={clearUndo} />

      <button onClick={() => setShowAdd(true)} data-testid="fab-add"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xl shadow-sky-600/30 active:bg-sky-500 active:scale-95 transition-all z-20">
        <Plus size={26} />
      </button>

      <AddTaskSheet open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} lists={store.lists} t={t} extractUrls={store.metaSettings?.pwa_auto_extract_url !== 'false'} />
      {showCalendar && (
        <MobileCalendar
          tasks={tasks}
          selectedDate={calendarDate}
          onSelectDate={setCalendarDate}
          onClose={() => setShowCalendar(false)}
        />
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <MobileDrawerContent
          t={t} locale={locale} tasks={tasks} store={store}
          agendaCounts={agendaCounts} counts={counts}
          dateRange={dateRange} setDateRange={setDateRange}
          filter={filter} setFilter={setFilter}
          listFilter={listFilter} setListFilter={setListFilter}
          tagFilter={tagFilter} setTagFilter={setTagFilter}
          calendarDate={calendarDate} setCalendarDate={setCalendarDate}
          setShowCalendar={setShowCalendar} setShowSettings={setShowSettings}
          setDrawerOpen={setDrawerOpen}
          gdriveConnected={gdriveConnected} setGdriveConnected={setGdriveConnected}
          showGdriveSetup={showGdriveSetup} setShowGdriveSetup={setShowGdriveSetup}
          gdriveClientId={gdriveClientId} setGdriveClientId={setGdriveClientId}
          gdriveClientSecret={gdriveClientSecret} setGdriveClientSecret={setGdriveClientSecret}
          syncLog={syncLog}
        />
      </Drawer>
    </div>
  )
}
