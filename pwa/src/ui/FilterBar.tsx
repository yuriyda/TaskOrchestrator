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

// Inactive chips collapse to icon-only so more chips fit on one row;
// the label animates in/out with a max-width + opacity transition.
const CHIP_BASE = 'flex items-center px-2 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 overflow-hidden'
const LABEL_BASE = 'whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin-left] duration-200 ease-out'
const labelCls = (active: boolean) => `${LABEL_BASE} ${active ? 'max-w-[200px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0'}`

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
        const active = filter === f.key
        return (
          <button key={f.key || 'all'} onClick={() => onFilter(f.key)} title={active ? undefined : f.label}
            className={`${CHIP_BASE} ${active ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'}`}>
            <Icon size={14} className="flex-shrink-0" />
            <span className={labelCls(active)}>{f.label}<span className="opacity-60 ml-1.5">{f.count}</span></span>
          </button>
        )
      })}
      {showActualOnly && (
        <button onClick={onToggleActualOnly} title={actualOnly ? undefined : t('filter.actualOnly')}
          className={`${CHIP_BASE} ${actualOnly ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'}`}>
          <EyeOff size={14} className="flex-shrink-0" />
          <span className={labelCls(!!actualOnly)}>{t('filter.actualOnly')}</span>
        </button>
      )}
      {showGroupByFlow && (
        <button onClick={onToggleGroupByFlow} title={groupByFlow ? undefined : t('filter.groupByFlow')}
          className={`${CHIP_BASE} ${groupByFlow ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'}`}>
          <Layers size={14} className="flex-shrink-0" />
          <span className={labelCls(!!groupByFlow)}>{t('filter.groupByFlow')}</span>
        </button>
      )}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
