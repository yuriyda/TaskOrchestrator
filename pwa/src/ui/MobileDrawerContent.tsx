/**
 * @file MobileDrawerContent.tsx
 * @description Contents of the slide-in drawer: agenda, status, lists, tags,
 * Settings shortcut, Google Drive block. Pulled out of MobileApp so the main
 * orchestrator stays focused on layout. All state is owned by MobileApp and
 * threaded in as props — no implicit context.
 */
import {
  X, Calendar, AlertTriangle, Filter, Inbox, Zap, CheckCircle2, Ban,
  List, Settings, RefreshCw, ExternalLink,
} from 'lucide-react'

interface Counts { all: number; inbox: number; active: number; done: number }
interface AgendaCounts { today: number; tomorrow: number; week: number; month: number; overdue: number }

interface Props {
  t: (key: string) => string
  locale: string
  tasks: any[]
  store: any
  agendaCounts: AgendaCounts
  counts: Counts
  dateRange: string | null
  setDateRange: (v: string | null) => void
  filter: string | null
  setFilter: (v: string | null) => void
  listFilter: string | null
  setListFilter: (v: any) => void
  tagFilter: string | null
  setTagFilter: (v: any) => void
  calendarDate: string | null
  setCalendarDate: (v: string | null) => void
  setShowCalendar: (v: boolean) => void
  setShowSettings: (v: boolean) => void
  setDrawerOpen: (v: boolean) => void
  gdriveConnected: boolean
  setGdriveConnected: (v: boolean) => void
  showGdriveSetup: boolean
  setShowGdriveSetup: (v: boolean) => void
  gdriveClientId: string
  setGdriveClientId: (v: string) => void
  gdriveClientSecret: string
  setGdriveClientSecret: (v: string) => void
  syncLog: string[]
}

export function MobileDrawerContent(p: Props) {
  const { t, locale, tasks, store, agendaCounts, counts, dateRange, setDateRange,
    filter, setFilter, listFilter, setListFilter, tagFilter, setTagFilter,
    calendarDate, setCalendarDate, setShowCalendar, setShowSettings, setDrawerOpen,
    gdriveConnected, setGdriveConnected, showGdriveSetup, setShowGdriveSetup,
    gdriveClientId, setGdriveClientId, gdriveClientSecret, setGdriveClientSecret, syncLog } = p

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Task Orchestrator</h2>
        <button onClick={() => setDrawerOpen(false)} className="p-1 text-gray-400">
          <X size={20} />
        </button>
      </div>

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

      {store.lists?.length > 0 && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">Lists</div>
          <div className="space-y-0.5">
            {store.lists.map((name: string) => (
              <button key={name}
                onClick={() => { setListFilter((prev: any) => prev === name ? null : name); setTagFilter(null); setDrawerOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm active:bg-slate-700 ${listFilter === name ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-300'}`}>
                <List size={14} className="text-emerald-400" />
                {name}
              </button>
            ))}
          </div>
        </>
      )}

      {store.tags?.length > 0 && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">{t('detail.tags') || 'Tags'}</div>
          <div className="flex flex-wrap gap-1.5">
            {store.tags.map((tag: string) => (
              <button key={tag}
                onClick={() => { setTagFilter((prev: any) => prev === tag ? null : tag); setListFilter(null); setDrawerOpen(false) }}
                className={`text-xs px-2 py-1 rounded-full ${tagFilter === tag ? 'bg-sky-500/30 text-sky-300 ring-1 ring-sky-400/50' : 'bg-sky-500/15 text-sky-400'}`}>
                #{tag}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 pt-4 border-t border-slate-700">
        <button onClick={() => { setShowSettings(true); setDrawerOpen(false) }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 active:bg-slate-700">
          <Settings size={16} className="text-gray-400" />
          <span className="flex-1 text-left">{locale === 'ru' ? 'Настройки' : 'Settings'}</span>
        </button>
      </div>

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
  )
}
