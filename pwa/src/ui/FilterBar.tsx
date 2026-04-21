import { Filter, Inbox, Zap, CheckCircle2, EyeOff } from 'lucide-react'

interface FilterBarProps {
  filter: string | null;
  onFilter: (key: string | null) => void;
  counts: { all: number; inbox: number; active: number; done: number };
  hideDone?: boolean;
  onToggleHideDone?: () => void;
  t: (key: string) => string;
}

function FilterBar({ filter, onFilter, counts, hideDone, onToggleHideDone, t }: FilterBarProps) {
  const items = [
    { key: null, label: t('filter.all'), count: counts.all, icon: Filter },
    { key: 'inbox', label: t('status.inbox'), count: counts.inbox, icon: Inbox },
    { key: 'active', label: t('status.active'), count: counts.active, icon: Zap },
    { key: 'done', label: t('status.done'), count: counts.done, icon: CheckCircle2 },
  ]
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
      {onToggleHideDone && (
        <button onClick={onToggleHideDone}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            hideDone ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20' : 'bg-slate-800 text-gray-400 active:bg-slate-700'
          }`}>
          <EyeOff size={12} />
          {t('filter.hideDone')}
        </button>
      )}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
