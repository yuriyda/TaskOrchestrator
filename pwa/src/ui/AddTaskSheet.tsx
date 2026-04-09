import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface AddTaskSheetProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: any) => void;
  lists: string[];
  t: (key: string) => string;
  extractUrls: boolean;
}

function AddTaskSheet({ open, onClose, onAdd, lists, t, extractUrls }: AddTaskSheetProps) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [list, setList] = useState('')
  const [priority, setPriority] = useState(4)
  const [showMore, setShowMore] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const reset = () => { setTitle(''); setDue(''); setList(''); setPriority(4); setShowMore(false) }

  const handleAdd = () => {
    if (!title.trim()) return
    const urlRe = /https?:\/\/[^\s]+/i
    const words = title.trim().split(/\s+/)
    let taskTitle = title.trim()
    let taskUrl = null
    if (extractUrls !== false) {
      const urlWord = words.find(w => urlRe.test(w))
      if (urlWord) {
        taskUrl = urlWord
        taskTitle = words.filter(w => w !== urlWord).join(' ')
      }
    }
    onAdd({
      title: taskTitle,
      due: due || null,
      list: list || null,
      priority,
      url: taskUrl,
    })
    reset()
    onClose()
  }

  if (!open) return null
  const inputCls = "w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-500 text-gray-200"

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute bottom-0 left-0 right-0 bg-slate-800 rounded-t-2xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !showMore) handleAdd() }}
          placeholder={t('mobile.newTask') || 'What needs to be done?'}
          className="w-full bg-slate-700 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 mb-3 text-gray-200 placeholder-gray-500"
        />

        {/* Priority chips */}
        <div className="flex gap-2 mb-3">
          {[1, 2, 3, 4].map(p => {
            const colors = { 1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-blue-400', 4: 'bg-gray-500' }
            const inactiveColors = { 1: 'text-red-400 bg-red-500/15', 2: 'text-orange-400 bg-orange-400/15', 3: 'text-blue-400 bg-blue-400/15', 4: 'text-gray-400 bg-slate-700' }
            return (
            <button key={p} onClick={() => setPriority(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                priority === p ? `${colors[p]} text-white` : `${inactiveColors[p]}`
              }`}>
              P{p}
            </button>
            )
          })}
        </div>

        {/* Expand more fields */}
        {!showMore ? (
          <button onClick={() => setShowMore(true)}
            className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 px-1">
            <ChevronDown size={12} />{t('mobile.moreOptions')}
          </button>
        ) : (
          <div className="space-y-2 mb-3">
            <input type="date" value={due} onChange={e => setDue(e.target.value)}
              placeholder="Due date" className={inputCls} />
            <input value={list} onChange={e => setList(e.target.value)}
              placeholder="List (e.g. Work)" className={inputCls} />
            {(lists || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {lists.filter(l => l !== list).map(l => (
                  <button key={l} type="button" onClick={() => setList(l)}
                    className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 active:bg-emerald-500/30">
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleAdd}
            disabled={!title.trim()}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
              title.trim() ? 'bg-sky-600 text-white active:bg-sky-500' : 'bg-slate-700 text-gray-500'
            }`}>
            {t('mobile.addTask')}
          </button>
          <button onClick={() => { onClose(); reset() }}
            className="px-5 py-3 rounded-xl text-sm bg-slate-700 text-gray-300 active:bg-slate-600">
            {t('mobile.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export { AddTaskSheet }
export type { AddTaskSheetProps }
