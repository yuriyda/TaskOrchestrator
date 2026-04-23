import { Filter, Inbox, Zap, CheckCircle2, EyeOff, Layers } from 'lucide-react'

interface FilterBarProps {
  filter: string | null;
  onFilter: (key: string | null) => void;
  counts: { all: number; inbox: number; active: number; done: number };
  actualOnly?: boolean;
  onToggleActualOnly?: () => void;
  groupByFlow?: boolean;
  onToggleGroupByFlow?: () => void;
  hasFlowTasks?: boolean;
  t: (key: string) => string;
}

function FilterBar({ filter, onFilter, counts, actualOnly, onToggleActualOnly, groupByFlow, onToggleGroupByFlow, hasFlowTasks, t }: FilterBarProps) {
  const items = [
    { key: null, label: t('filter.all'), count: counts.all, icon: Filter },
    { key: 'inbox', label: t('status.inbox'), count: counts.inbox, icon: Inbox },
    { key: 'active', label: t('status.active'), count: counts.active, icon: Zap },
    { key: 'done', label: t('status.done'), count: counts.done, icon: CheckCircle2 },
  ]
  const showActualOnly = !!onToggleActualOnly && filter === null
  const showGroupByFlow = !!onToggleGroupByFlow && !!hasFlowTasks
  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
      {items.map(f => {
        const Icon = f.icon
        return (
          <button key={f.key || 'all'} onClick={() => onFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              filter === f.key ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'
            }`}>
            <Icon size={12} />
            {f.label}
            <span className="opacity-60">{f.count}</span>
          </button>
        )
      })}
      {showActualOnly && (
        <button onClick={onToggleActualOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            actualOnly ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'
          }`}>
          <EyeOff size={12} />
          {t('filter.actualOnly')}
        </button>
      )}
      {showGroupByFlow && (
        <button onClick={onToggleGroupByFlow}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            groupByFlow ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'
          }`}>
          <Layers size={12} />
          {t('filter.groupByFlow')}
        </button>
      )}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
