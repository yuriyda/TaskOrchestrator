import { Calendar, AlertTriangle } from 'lucide-react'

interface AgendaBarProps {
  dateRange: string | null;
  onDateRange: (range: string | null) => void;
  agendaCounts: Record<string, number>;
  t: (key: string) => string;
}

// See FilterBar.tsx — same animated icon→label transition pattern.
const CHIP_BASE = 'flex items-center px-2 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 overflow-hidden'
const LABEL_BASE = 'whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin-left] duration-200 ease-out'
const labelCls = (active: boolean) => `${LABEL_BASE} ${active ? 'max-w-[200px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'}`

function AgendaBar({ dateRange, onDateRange, agendaCounts, t }: AgendaBarProps) {
  const items = [
    { key: 'today',    label: t('agenda.today'),    count: agendaCounts.today,    icon: Calendar },
    { key: 'tomorrow', label: t('agenda.tomorrow'), count: agendaCounts.tomorrow, icon: Calendar },
    { key: 'week',     label: t('agenda.week'),     count: agendaCounts.week,     icon: Calendar },
    { key: 'overdue',  label: t('agenda.overdue'),  count: agendaCounts.overdue,  icon: AlertTriangle },
  ]
  return (
    <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-none">
      {items.map(f => {
        const Icon = f.icon
        const isOverdue = f.key === 'overdue'
        const active = dateRange === f.key
        return (
          <button key={f.key} onClick={() => onDateRange(active ? null : f.key)} title={active ? undefined : f.label}
            className={`${CHIP_BASE} ${
              active
                ? (isOverdue ? 'bg-red-600 text-white shadow-md shadow-red-600/20' : 'bg-sky-600 text-white shadow-md shadow-sky-600/20')
                : (isOverdue && f.count > 0 ? 'bg-red-500/15 text-red-400 active:bg-red-500/25' : 'bg-slate-800 text-gray-400 active:bg-slate-700')
            }`}>
            <Icon size={14} className="flex-shrink-0" />
            <span className={labelCls(active)}>{f.label}<span className="opacity-60 ml-1.5">{f.count}</span></span>
          </button>
        )
      })}
    </div>
  )
}

export { AgendaBar }
export type { AgendaBarProps }
