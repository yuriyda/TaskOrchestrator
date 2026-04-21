import { useState } from 'react'
import {
  ChevronLeft, Save, Edit3, X, Calendar, Flag, List, Repeat,
  Trash2, StickyNote,
} from 'lucide-react'
import { localIsoDate } from '@shared/core/date.js'
import { STATUS_ICONS, STATUS_COLORS, FULL_CYCLE } from './mobileConstants'

interface TaskDetailProps {
  task: any;
  store: any;
  onBack: () => void;
  t: (key: string) => string;
}

function TaskDetail({ task, store, onBack, t }: TaskDetailProps) {
  if (!task) return null
  const today = localIsoDate(new Date())
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due || '')
  const [list, setList] = useState(task.list || '')
  const [tagsStr, setTagsStr] = useState((task.tags || []).join(', '))
  const [recurrence, setRecurrence] = useState(task.recurrence || '')
  const [estimate, setEstimate] = useState(task.estimate || '')
  const [url, setUrl] = useState(task.url || '')
  const [notesStr, setNotesStr] = useState((task.notes || []).map(n => n.content).join('\n---\n'))

  const handleSave = async () => {
    const tags = tagsStr.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    await store.updateTask(task.id, {
      title, due: due || null, list: list || null,
      tags, recurrence: recurrence || null, estimate: estimate || null, url: url || null,
    })
    if (store.saveNotes) {
      // saveNotes contract: Array<{ id?, content, createdAt? }>.
      // Position-based id preservation — editing note at index i keeps its id
      // so sync stays cheap (update, not delete+insert). Reordering by insert/
      // delete in the middle of the list is a known-imperfect case; full rich
      // note editor with explicit per-note id is out of scope (Task 4 phase 2+).
      const texts = notesStr.split('\n---\n').map(s => s.trim()).filter(Boolean)
      const oldNotes = task.notes || []
      const notes = texts.map((content, i) => ({
        id: oldNotes[i]?.id,
        content,
        createdAt: oldNotes[i]?.createdAt,
      }))
      await store.saveNotes(task.id, notes)
    }
    setEditing(false)
  }

  const inputCls = "w-full bg-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-sky-500 text-gray-200"

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" data-testid="task-detail">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700/50">
        <button onClick={onBack} className="p-1 -ml-1 text-gray-400 active:text-white">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-base font-semibold flex-1 truncate">{task.title}</h2>
        <button onClick={() => editing ? handleSave() : setEditing(true)}
          className={`p-1.5 rounded-lg ${editing ? 'text-sky-400 bg-sky-600/20' : 'text-gray-400'}`}>
          {editing ? <Save size={18} /> : <Edit3 size={18} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Editable fields */}
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Due date</label>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">List</label>
              <input value={list} onChange={e => setList(e.target.value)} placeholder="e.g. Work, Personal"
                className={inputCls} />
              {(store.lists || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {store.lists.filter(l => l !== list).map(l => (
                    <button key={l} type="button" onClick={() => setList(l)}
                      className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 active:bg-emerald-500/30">
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Tags (comma separated)</label>
              <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="e.g. urgent, code"
                className={inputCls} />
              {(store.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {store.tags.filter(tag => {
                    const current = tagsStr.split(',').map(t => t.trim().replace(/^#/, ''))
                    return !current.includes(tag)
                  }).map(tag => (
                    <button key={tag} type="button" onClick={() => setTagsStr(prev => prev ? prev + ', ' + tag : tag)}
                      className="text-xs px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-400 active:bg-sky-500/30">
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">{t('detail.recurrence') || 'Recurrence'}</label>
              <input value={recurrence} onChange={e => setRecurrence(e.target.value)} placeholder="e.g. weekly, monthly, every 3 days"
                className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">{t('detail.estimate') || 'Estimate'}</label>
              <input value={estimate} onChange={e => setEstimate(e.target.value)} placeholder="e.g. 2 hours"
                className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." type="url"
                className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                <StickyNote size={10} className="inline mr-1" />{t('detail.notes') || 'Notes'}
              </label>
              <textarea value={notesStr} onChange={e => setNotesStr(e.target.value)}
                placeholder={t('mobile.addNotes') || 'Add notes...'}
                rows={4}
                className={`${inputCls} resize-y min-h-[80px]`} />
            </div>
            <button onClick={handleSave}
              className="w-full py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold active:bg-sky-500">
              {t('mobile.save')}
            </button>
          </div>
        ) : (
          <>
            {/* Read-only fields */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Status', value: t(`status.${task.status}`) || task.status, icon: STATUS_ICONS[task.status], color: STATUS_COLORS[task.status] },
                { label: 'Priority', value: `P${task.priority}`, icon: Flag },
                task.recurrence && { label: t('detail.recurrence') || 'Recurrence', value: task.recurrence, icon: Repeat },
                task.list && { label: 'List', value: task.list, icon: List },
                task.estimate && { label: 'Estimate', value: task.estimate },
              ].filter(Boolean).map((f, i) => (
                <div key={i} className="bg-slate-800/80 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{f.label}</div>
                  <div className={`text-sm font-medium flex items-center gap-1.5 ${f.color || 'text-gray-200'}`}>
                    {f.icon && <f.icon size={14} />}
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Due date — inline editable */}
            <div className="bg-slate-800/80 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{t('detail.due') || 'Due date'}</div>
              <div className="flex items-center gap-2">
                <Calendar size={14} className={task.due && task.due < today ? 'text-red-400' : 'text-sky-400'} />
                <input type="date" value={task.due || ''}
                  onChange={e => store.updateTask(task.id, { due: e.target.value || null })}
                  className="flex-1 bg-transparent text-sm font-medium text-gray-200 outline-none [color-scheme:dark]" />
                {task.due && (
                  <button onClick={() => store.updateTask(task.id, { due: null })}
                    className="p-1 text-gray-500 active:text-red-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* URL */}
            {task.url && (
              <div className="bg-slate-800/80 rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">URL</div>
                <a href={task.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sky-400 truncate block">
                  {task.url}
                </a>
              </div>
            )}

            {/* Tags */}
            {task.tags?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-400">#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                <StickyNote size={10} className="inline mr-1" />{t('detail.notes') || 'Notes'}
              </div>
              {task.notes?.length > 0 ? (
                task.notes.map(n => (
                  <div key={n.id} className="bg-slate-800/80 rounded-xl p-3 text-sm text-gray-300 mb-2 whitespace-pre-wrap">{n.content}</div>
                ))
              ) : (
                <div className="text-xs text-gray-600 italic">{t('mobile.noNotes') || 'No notes. Tap ✏ to edit.'}</div>
              )}
            </div>

            {/* Status buttons */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{t('detail.status')}</div>
              <div className="grid grid-cols-2 gap-2">
                {FULL_CYCLE.map(s => {
                  const Icon = STATUS_ICONS[s]
                  return (
                    <button key={s} onClick={() => store.bulkStatus(new Set([task.id]), s)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        task.status === s ? 'bg-sky-600 text-white' : 'bg-slate-800 text-gray-300 active:bg-slate-700'
                      }`}>
                      <Icon size={14} />{t(`status.${s}`) || s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Priority buttons */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{t('detail.priority')}</div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(p => {
                  const colors = { 1: 'bg-red-500', 2: 'bg-orange-400', 3: 'bg-blue-400', 4: 'bg-gray-500' }
                  const inactiveColors = { 1: 'text-red-400 bg-red-500/15', 2: 'text-orange-400 bg-orange-400/15', 3: 'text-blue-400 bg-blue-400/15', 4: 'text-gray-400 bg-slate-800' }
                  return (
                  <button key={p} onClick={() => store.bulkPriority(new Set([task.id]), p)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      task.priority === p ? `${colors[p]} text-white` : `${inactiveColors[p]} active:opacity-80`
                    }`}>
                    P{p}
                  </button>
                  )
                })}
              </div>
            </div>

            {/* Delete */}
            <button onClick={() => { store.bulkDelete(new Set([task.id])); onBack() }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600/15 text-red-400 text-sm font-medium active:bg-red-600/25 mt-4">
              <Trash2 size={16} />{t('mobile.deleteTask') || 'Delete task'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export { TaskDetail }
export type { TaskDetailProps }
