import { Calendar, AlertTriangle } from 'lucide-react'

interface AgendaBarProps {
  dateRange: string | null;
  onDateRange: (range: string | null) => void;
  agendaCounts: Record<string, number>;
  t: (key: string) => string;
}

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
        return (
          <button key={f.key} onClick={() => onDateRange(dateRange === f.key ? null : f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              dateRange === f.key
                ? (isOverdue ? 'bg-red-600 text-white shadow-md shadow-red-600/20' : 'bg-sky-600 text-white shadow-md shadow-sky-600/20')
                : (isOverdue && f.count > 0 ? 'bg-red-500/15 text-red-400 active:bg-red-500/25' : 'bg-slate-800 text-gray-400 active:bg-slate-700')
            }`}>
            <Icon size={12} />
            {f.label}
            <span className="opacity-60">{f.count}</span>
          </button>
        )
      })}
    </div>
  )
}

export { AgendaBar }
export type { AgendaBarProps }
