import { Search, X } from 'lucide-react'

function SearchBar({ query, onChange, t }) {
  return (
    <div className="px-4 py-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={e => onChange(e.target.value)}
          placeholder={t('search.placeholder') || 'Search tasks...'}
          className="w-full bg-slate-800 rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none focus:ring-1 focus:ring-sky-500 text-gray-200 placeholder-gray-500"
        />
        {query && (
          <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 p-1">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export { SearchBar }
