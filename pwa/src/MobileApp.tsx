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
  }, [tasks, filter, dateRange, listFilter, tagFilter, calendarDate, searchQuery, today, isPastDue])

  // Counts
  const counts = useMemo(() => ({
    all: tasks.length,
    inbox: tasks.filter(t => t.status === 'inbox').length,
    active: tasks.filter(t => t.status === 'active').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  // Overdue tasks float to top
  const overdueTasks = useMemo(() =>
    filtered.filter(t => isPastDue(t)),
    [filtered, isPastDue]
  )
  const regularTasks = useMemo(() =>
    filtered.filter(t => !isPastDue(t)),
    [filtered, isPastDue]
  )

  const handleCycle = useCallback((id) => {
    store.bulkCycle(new Set([id]))
  }, [store])

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
    return <TaskDetail task={detailTask} store={store} onBack={() => setDetailId(null)} t={t} />
  }

  // ── Main list view ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-900" data-testid="mobile-app">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-800/90 backdrop-blur-sm sticky top-0 z-30 border-b border-slate-700/30">
        <button onClick={() => setDrawerOpen(true)} className="p-1 -ml-1 text-gray-400 active:text-white">
          <Menu size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold hidden min-[480px]:block truncate">Task Orchestrator</h1>
          <svg className="w-7 h-7 min-[480px]:hidden" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="96" fill="#0f172a"/>
            <circle cx="256" cy="256" r="180" fill="none" stroke="#3b82f6" strokeWidth="24" opacity="0.3"/>
            <circle cx="256" cy="256" r="140" fill="none" stroke="#3b82f6" strokeWidth="20"/>
            <polyline points="180,260 232,312 340,204" fill="none" stroke="#60a5fa" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <button onClick={() => setSearchVisible(v => !v)} className={`p-1.5 rounded-lg ${searchVisible || searchQuery ? 'text-sky-400' : 'text-gray-400'} active:text-white`}>
          <Search size={18} />
        </button>
        {syncMsg && (
          <span className="text-[10px] text-emerald-400 mr-1">{syncMsg}</span>
        )}
        {store.gdriveSyncNow && gdriveConnected && (
          <button onClick={async () => {
            setSyncMsg(null)
            try { await handleSyncNow() } catch { /* already logged in hook */ }
          }} disabled={autoSyncing}
            className={`p-1.5 rounded-lg text-gray-400 active:text-sky-400 ${autoSyncing ? 'animate-spin' : ''}`}>
            <RefreshCw size={18} />
          </button>
        )}
        <div className="text-[10px] text-gray-500 tabular-nums text-right">
          {lastSync && (
            <div className="text-emerald-500/70">{t('sync.lastSync') || 'Sync'}: {new Date(lastSync).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
          )}
          <div>{counts.active}/{counts.all}</div>
        </div>
      </header>

      {/* Search (hidden by default, toggled via header icon) */}
      {(searchVisible || searchQuery) && (
        <SearchBar query={searchQuery} onChange={v => { setSearchQuery(v); if (!v) setSearchVisible(false) }} t={t} />
      )}

      {/* Filter chips */}
      <FilterBar filter={filter} onFilter={setFilter} counts={counts} t={t} />

      {/* Agenda chips */}
      <AgendaBar dateRange={dateRange} onDateRange={setDateRange} agendaCounts={agendaCounts} t={t} />

      {/* Active list/tag filter */}
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

      {/* Task list */}
      <main className="flex-1 overflow-y-auto pb-24" data-testid="task-list">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-20 text-sm">
            {searchQuery ? (t('search.noResults') || 'No tasks found') : (t('mobile.emptyState') || 'No tasks. Tap + to add one.')}
          </div>
        ) : (
          <div className="space-y-1.5 py-2">
            {/* Overdue section */}
            {overdueTasks.length > 0 && (
              <>
                <div className="px-2 pt-1 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    {t('agenda.overdue')} ({overdueTasks.length})
                  </span>
                </div>
                {overdueTasks.map(task => (
                  <TaskItem key={task.id} task={task} locale={locale} onTap={setDetailId} onCycle={handleCycle} onComplete={handleComplete} onDelete={handleDelete} />
                ))}
                <div className="h-2" />
              </>
            )}
            {/* Regular tasks */}
            {regularTasks.map(task => (
              <TaskItem key={task.id} task={task} locale={locale} onTap={setDetailId} onCycle={handleCycle} onComplete={handleComplete} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {/* Update toast */}
      {updateMsg && (
        <div className={`fixed top-16 left-4 right-4 z-40 flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg shadow-black/30 animate-[fadeIn_0.2s_ease-out] ${updateMsg.ok ? 'bg-emerald-900/90' : 'bg-slate-700'}`}>
          <RefreshCw size={14} className={updateMsg.ok ? 'text-emerald-400' : 'text-amber-400'} />
          <span className={`flex-1 text-sm ${updateMsg.ok ? 'text-emerald-200' : 'text-gray-200'}`}>{updateMsg.text}</span>
          <button onClick={() => setUpdateMsg(null)} className="text-gray-400 p-1"><X size={14} /></button>
        </div>
      )}

      {/* Undo toast — Undo button only shown when undo.undo is a function */}
      {undoAction && (
        <div className="fixed bottom-24 left-4 right-4 z-30 flex items-center gap-3 bg-slate-700 rounded-xl px-4 py-3 shadow-lg shadow-black/30 animate-[fadeIn_0.2s_ease-out]">
          <span className="flex-1 text-sm text-gray-200">{undoAction.label}</span>
          {undoAction.undo && (
            <button onClick={() => { undoAction.undo!(); clearUndo() }}
              className="px-3 py-1 rounded-lg text-sm font-semibold text-sky-400 bg-sky-600/20 active:bg-sky-600/30">
              {locale === 'ru' ? 'Отменить' : 'Undo'}
            </button>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        data-testid="fab-add"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xl shadow-sky-600/30 active:bg-sky-500 active:scale-95 transition-all z-20">
        <Plus size={26} />
      </button>

      {/* Add Task Bottom Sheet */}
      <AddTaskSheet open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} lists={store.lists} t={t} extractUrls={store.metaSettings?.pwa_auto_extract_url !== 'false'} />

      {/* Calendar (full-screen) */}
      {showCalendar && (
        <MobileCalendar
          tasks={tasks}
          selectedDate={calendarDate}
          onSelectDate={setCalendarDate}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* Drawer Sidebar */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="p-4 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">Task Orchestrator</h2>
            <button onClick={() => setDrawerOpen(false)} className="p-1 text-gray-400">
              <X size={20} />
            </button>
          </div>

          {/* Schedule */}
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{t('sidebar.agenda') || 'Schedule'}</div>
          <div className="space-y-0.5 mb-4">
            {[
              { key: 'today',    label: t('agenda.today'),    count: agendaCounts.today,    icon: Calendar },
              { key: 'tomorrow', label: t('agenda.tomorrow'), count: agendaCounts.tomorrow, icon: Calendar },
              { key: 'week',     label: t('agenda.week'),     count: agendaCounts.week,     icon: Calendar },
              { key: 'month',    label: t('agenda.month'),    count: agendaCounts.month,    icon: Calendar },
              { key: 'overdue',  label: t('agenda.overdue'),  count: agendaCounts.overdue,  icon: AlertTriangle },
            ].map(f => {
              const Icon = f.icon
              const isOverdue = f.key === 'overdue'
              return (
                <button key={f.key}
                  onClick={() => { setDateRange(dateRange === f.key ? null : f.key); setDrawerOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    dateRange === f.key ? 'bg-sky-600/20 text-sky-400'
                    : isOverdue && f.count > 0 ? 'text-red-400 active:bg-slate-700'
                    : 'text-gray-300 active:bg-slate-700'
                  }`}>
                  <Icon size={16} className={`flex-shrink-0 ${isOverdue && f.count > 0 ? 'text-red-400' : 'text-sky-400'}`} />
                  <span className="flex-1 text-left">{f.label}</span>
                  <span className={`text-xs ${isOverdue && f.count > 0 ? 'text-red-400' : 'text-gray-500'}`}>{f.count}</span>
                </button>
              )
            })}
            <button onClick={() => { setShowCalendar(true); setDrawerOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 active:bg-slate-700">
              <Calendar size={16} className="text-sky-400" />
              <span className="flex-1 text-left">{locale === 'ru' ? 'Календарь' : 'Calendar'}</span>
            </button>
            {calendarDate && (
              <button onClick={() => { setCalendarDate(null); setDrawerOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-amber-400 active:bg-slate-700">
                <X size={14} />
                <span>{locale === 'ru' ? 'Сбросить дату' : 'Clear date filter'}: {calendarDate}</span>
              </button>
            )}
          </div>

          {/* Status filters */}
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Status</div>
          <div className="space-y-0.5 mb-4">
            {[
              { key: null, label: t('filter.all') || 'All', count: counts.all, icon: Filter },
              { key: 'inbox', label: t('status.inbox') || 'Inbox', count: counts.inbox, icon: Inbox },
              { key: 'active', label: t('status.active') || 'Active', count: counts.active, icon: Zap },
              { key: 'done', label: t('status.done') || 'Done', count: counts.done, icon: CheckCircle2 },
              { key: 'cancelled', label: t('status.cancelled') || 'Cancelled', count: tasks.filter(t => t.status === 'cancelled').length, icon: Ban },
            ].map(f => {
              const Icon = f.icon
              return (
                <button key={f.key || 'all'}
                  onClick={() => { setFilter(f.key); setDrawerOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    filter === f.key ? 'bg-sky-600/20 text-sky-400' : 'text-gray-300 active:bg-slate-700'
                  }`}>
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="flex-1 text-left">{f.label}</span>
                  <span className="text-xs text-gray-500">{f.count}</span>
                </button>
              )
            })}
          </div>

          {/* Lists */}
          {store.lists?.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">Lists</div>
              <div className="space-y-0.5">
                {store.lists.map(name => (
                  <button key={name}
                    onClick={() => { setListFilter(prev => prev === name ? null : name); setTagFilter(null); setDrawerOpen(false) }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm active:bg-slate-700 ${listFilter === name ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-300'}`}>
                    <List size={14} className="text-emerald-400" />
                    {name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Tags */}
          {store.tags?.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">{t('detail.tags') || 'Tags'}</div>
              <div className="flex flex-wrap gap-1.5">
                {store.tags.map(tag => (
                  <button key={tag}
                    onClick={() => { setTagFilter(prev => prev === tag ? null : tag); setListFilter(null); setDrawerOpen(false) }}
                    className={`text-xs px-2 py-1 rounded-full ${tagFilter === tag ? 'bg-sky-500/30 text-sky-300 ring-1 ring-sky-400/50' : 'bg-sky-500/15 text-sky-400'}`}>
                    #{tag}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Settings */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <button onClick={() => { setShowSettings(true); setDrawerOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 active:bg-slate-700">
              <Settings size={16} className="text-gray-400" />
              <span className="flex-1 text-left">{locale === 'ru' ? 'Настройки' : 'Settings'}</span>
            </button>
          </div>

          {/* Google Drive Sync */}
          {store.gdriveConnectAccount && (
            <div className="mt-6 pt-4 border-t border-slate-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Google Drive</div>
              {gdriveConnected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />{locale === 'ru' ? 'Подключён' : 'Connected'}
                  </div>
                  <button onClick={async () => {
                    await store.gdriveDisconnectAccount()
                    setGdriveConnected(false)
                    setDrawerOpen(false)
                  }}
                    className="w-full px-3 py-2 rounded-lg text-xs text-gray-400 active:bg-slate-700 text-left">
                    {locale === 'ru' ? 'Отключить' : 'Disconnect'}
                  </button>
                  {syncLog.length > 0 && (
                    <div className="max-h-24 overflow-y-auto rounded-lg bg-slate-900 p-2 font-mono text-[10px] text-gray-500 leading-relaxed mt-2">
                      {syncLog.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  )}
                </div>
              ) : showGdriveSetup ? (
                <div className="space-y-2">
                  <a href="https://github.com/yuriyda/TaskOrchestrator/blob/main/GOOGLE_DRIVE_SETUP.md" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-sky-400 active:text-sky-300 mb-1">
                    <ExternalLink size={10} />
                    {locale === 'ru' ? 'Пошаговая инструкция' : 'Step-by-step guide'}
                  </a>
                  <input value={gdriveClientId} onChange={e => setGdriveClientId(e.target.value)}
                    placeholder="Client ID" className="w-full bg-slate-700 rounded-lg px-3 py-2 text-xs outline-none text-gray-200" />
                  <input value={gdriveClientSecret} onChange={e => setGdriveClientSecret(e.target.value)}
                    type="password" placeholder="Client Secret"
                    className="w-full bg-slate-700 rounded-lg px-3 py-2 text-xs outline-none text-gray-200" />
                  <button onClick={() => {
                    if (gdriveClientId.trim() && gdriveClientSecret.trim()) {
                      store.gdriveConnectAccount(gdriveClientId.trim(), gdriveClientSecret.trim())
                    }
                  }}
                    disabled={!gdriveClientId.trim() || !gdriveClientSecret.trim()}
                    className={`w-full py-2 rounded-lg text-xs font-medium ${
                      gdriveClientId.trim() && gdriveClientSecret.trim()
                        ? 'bg-sky-600 text-white' : 'bg-slate-700 text-gray-500'
                    }`}>
                    Connect
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowGdriveSetup(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 active:bg-slate-700">
                  <RefreshCw size={14} className="text-sky-400" />
                  Setup sync
                </button>
              )}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  )
}
