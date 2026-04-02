/**
 * @file MobileApp.jsx — mobile-first layout for PWA.
 * Reuses shared logic (i18n, themes, constants, date utils) from the desktop app
 * but provides a completely different layout optimized for touch screens.
 *
 * Layout: single-column, full-width task list, drawer sidebar, bottom sheet
 * for task creation, full-screen detail view on tap.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { LOCALES } from '@shared/i18n/locales.js'
import { STATUSES, PRIORITY_COLORS } from '@shared/core/constants.js'
import { localIsoDate, parseDateInput, fmtDate } from '@shared/core/date.js'
import { overdueLevel } from '@shared/core/overdue.js'
import { humanRecurrence } from '@shared/core/recurrence.js'
import {
  Plus, Search, Menu, X, ChevronRight, ChevronLeft,
  Inbox, Zap, CheckCircle2, Ban, Circle, Repeat,
  Trash2, Calendar, Flag, List, Hash, ArrowUp, ArrowDown,
  Filter, Settings, ChevronDown, RefreshCw, Save, Edit3,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_ICONS = { inbox: Inbox, active: Zap, done: CheckCircle2, cancelled: Ban }
const STATUS_COLORS = {
  inbox: 'text-gray-400', active: 'text-sky-400',
  done: 'text-emerald-400', cancelled: 'text-gray-500',
}
// Overdue stripe colours (consistent with desktop)
const OVERDUE_STRIPE_CLS = 'border-l-red-500'
const NORMAL_STRIPE_CLS = 'border-l-transparent'
const FULL_CYCLE = ['inbox', 'active', 'done', 'cancelled']

function useTranslation(locale) {
  return useCallback((key) => {
    return (LOCALES[locale] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key
  }, [locale])
}

// ─── Mobile Calendar ──────────────────────────────────────────────────────────

function MobileCalendar({ tasks, onSelectDate, selectedDate, onClose }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const today = localIsoDate(new Date())

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  // Task counts per date
  const tasksByDate = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (t.due && t.status !== 'done' && t.status !== 'cancelled') {
        map[t.due] = (map[t.due] || 0) + 1
      }
    }
    return map
  }, [tasks])

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  // Build grid cells: empty cells for offset + day cells
  const offset = (firstDay + 6) % 7 // Monday-first
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" data-testid="mobile-calendar">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700/50">
        <button onClick={onClose} className="p-1 -ml-1 text-gray-400 active:text-white">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-base font-semibold flex-1">Calendar</h2>
      </div>

      <div className="p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 text-gray-400 active:text-white"><ChevronLeft size={20} /></button>
          <span className="text-sm font-semibold">{monthName}</span>
          <button onClick={nextMonth} className="p-2 text-gray-400 active:text-white"><ChevronRight size={20} /></button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
            <div key={d} className="text-center text-[10px] text-gray-500 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const count = tasksByDate[dateStr] || 0
            return (
              <button key={i} onClick={() => { onSelectDate(dateStr); onClose() }}
                className={`relative flex flex-col items-center py-2 rounded-lg text-sm transition-all ${
                  isSelected ? 'bg-sky-600 text-white' :
                  isToday ? 'bg-sky-600/20 text-sky-400' :
                  'text-gray-300 active:bg-slate-700'
                }`}>
                {day}
                {count > 0 && (
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-sky-400'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tasks for selected date */}
      {selectedDate && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            {selectedDate}
          </div>
          {tasks.filter(t => t.due === selectedDate).map(t => (
            <div key={t.id} className="flex items-center gap-2 py-2 text-sm text-gray-300">
              {React.createElement(STATUS_ICONS[t.status] || Circle, { size: 14, className: STATUS_COLORS[t.status] })}
              <span className={t.status === 'done' ? 'line-through text-gray-500' : ''}>{t.title}</span>
            </div>
          ))}
          {tasks.filter(t => t.due === selectedDate).length === 0 && (
            <div className="text-xs text-gray-500 py-4 text-center">No tasks on this date</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Drawer Sidebar ───────────────────────────────────────────────────────────

function Drawer({ open, onClose, children }) {
  const drawerRef = useRef(null)

  useEffect(() => {
    const el = drawerRef.current
    if (!el || !open) return
    let startX = 0, dx = 0, horizontal = false
    const onStart = (e) => { startX = e.touches[0].clientX; dx = 0; horizontal = false }
    const onMove = (e) => {
      const curDx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - e.touches[0].clientY)
      if (!horizontal && Math.abs(curDx) > 15) horizontal = true
      if (horizontal && curDx < 0) dx = curDx
    }
    const onEnd = () => { if (dx < -60) onClose(); startX = 0; dx = 0; horizontal = false }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [open, onClose])

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 bottom-0 w-72 bg-slate-800 z-50 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {children}
      </div>
    </>
  )
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

function FilterBar({ filter, onFilter, counts, t }) {
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
    </div>
  )
}

// ─── Task Item ────────────────────────────────────────────────────────────────

function TaskItem({ task, onTap, onCycle, onComplete, onDelete }) {
  const StatusIcon = STATUS_ICONS[task.status] || Circle
  const today = localIsoDate(new Date())
  const isOverdue = task.due && task.due < today && task.status !== 'done' && task.status !== 'cancelled'
  const stripeCls = isOverdue ? OVERDUE_STRIPE_CLS : NORMAL_STRIPE_CLS

  const cardRef = useRef(null)
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false, dx: 0 })
  const [swipeX, setSwipeX] = useState(0)

  const onPointerDown = (e) => {
    touchRef.current = { startX: e.clientX, startY: e.clientY, swiping: false, dx: 0 }
    cardRef.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const t = touchRef.current
    if (!t.startX) return
    const dx = e.clientX - t.startX
    const dy = e.clientY - t.startY
    if (!t.swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      t.swiping = true
    }
    if (t.swiping) {
      t.dx = dx
      setSwipeX(dx)
    }
  }
  const onPointerUp = () => {
    const t = touchRef.current
    const w = cardRef.current?.offsetWidth || 300
    const threshold = w * 0.6
    if (t.swiping && t.dx > threshold && onComplete) onComplete(task.id)
    else if (t.swiping && t.dx < -threshold && onDelete) onDelete(task.id)
    touchRef.current = { startX: 0, startY: 0, swiping: false, dx: 0 }
    setSwipeX(0)
  }

  const w = cardRef.current?.offsetWidth || 300
  const threshold = w * 0.3
  const bgColor = swipeX > threshold ? 'bg-emerald-600' : swipeX < -threshold ? 'bg-red-600' : swipeX > 0 ? 'bg-emerald-600/50' : swipeX < 0 ? 'bg-red-600/50' : ''

  return (
    <div className="mx-4 relative overflow-hidden rounded-xl">
      {/* Swipe background */}
      {swipeX !== 0 && (
        <div className={`absolute inset-0 flex items-center ${swipeX > 0 ? 'justify-start pl-5' : 'justify-end pr-5'} ${bgColor} rounded-xl`}>
          {swipeX > 0 ? <CheckCircle2 size={22} className="text-white" /> : <Trash2 size={22} className="text-white" />}
        </div>
      )}
      {/* Card */}
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => { if (!touchRef.current.swiping) onTap(task.id) }}
        style={{ transform: `translateX(${swipeX}px)`, transition: swipeX === 0 ? 'transform 0.2s ease-out' : 'none', touchAction: 'pan-y' }}
        className={`flex items-center gap-3 px-3 py-3.5 bg-slate-800/90 border-l-[3px] ${stripeCls} rounded-xl relative z-10`}>
        <button
          onClick={(e) => { e.stopPropagation(); onCycle(task.id) }}
          className={`flex-shrink-0 p-1 -m-1 ${STATUS_COLORS[task.status]}`}>
          <StatusIcon size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm leading-tight ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
            {task.title}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {task.priority < 4 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                task.priority === 1 ? 'bg-red-500/20 text-red-400' :
                task.priority === 2 ? 'bg-amber-500/20 text-amber-400' :
                'bg-sky-500/20 text-sky-400'
              }`}>P{task.priority}</span>
            )}
            {task.due && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isOverdue ? 'bg-red-500/20 text-red-400' : 'text-gray-500'}`}>
                {task.due}
              </span>
            )}
            {task.recurrence && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 flex items-center gap-0.5">
                <Repeat size={8} />{task.recurrence}
              </span>
            )}
            {task.list && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{task.list}</span>
            )}
            {(task.tags || []).slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">#{tag}</span>
            ))}
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
      </div>
    </div>
  )
}

// ─── Task Detail (full-screen, editable) ──────────────────────────────────────

function TaskDetail({ task, store, onBack, t }) {
  if (!task) return null
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.due || '')
  const [list, setList] = useState(task.list || '')
  const [tagsStr, setTagsStr] = useState((task.tags || []).join(', '))
  const [recurrence, setRecurrence] = useState(task.recurrence || '')
  const [estimate, setEstimate] = useState(task.estimate || '')
  const [url, setUrl] = useState(task.url || '')

  const handleSave = async () => {
    const tags = tagsStr.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    await store.updateTask(task.id, {
      title, due: due || null, list: list || null,
      tags, recurrence: recurrence || null, estimate: estimate || null, url: url || null,
    })
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
                className={inputCls} list="lists-datalist" />
              <datalist id="lists-datalist">
                {(store.lists || []).map(l => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Tags (comma separated)</label>
              <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="e.g. urgent, code"
                className={inputCls} />
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
                task.due && { label: 'Due', value: task.due, icon: Calendar },
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

            {/* URL */}
            {task.url && (
              <a href={task.url} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-sky-400 truncate bg-slate-800/80 rounded-xl p-3">
                {task.url}
              </a>
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
            {task.notes?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Notes</div>
                {task.notes.map(n => (
                  <div key={n.id} className="bg-slate-800/80 rounded-xl p-3 text-sm text-gray-300 mb-2">{n.content}</div>
                ))}
              </div>
            )}

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
                {[1, 2, 3, 4].map(p => (
                  <button key={p} onClick={() => store.bulkPriority(new Set([task.id]), p)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      task.priority === p ? 'bg-sky-600 text-white' : 'bg-slate-800 text-gray-400 active:bg-slate-700'
                    }`}>
                    P{p}
                  </button>
                ))}
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

// ─── Bottom Sheet (Add Task) ──────────────────────────────────────────────────

function AddTaskSheet({ open, onClose, onAdd, lists, t }) {
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
    onAdd({
      title: title.trim(),
      due: due || null,
      list: list || null,
      priority,
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
          placeholder={t('quickEntry.placeholder') || 'What needs to be done?'}
          className="w-full bg-slate-700 rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 mb-3 text-gray-200 placeholder-gray-500"
        />

        {/* Priority chips */}
        <div className="flex gap-2 mb-3">
          {[1, 2, 3, 4].map(p => (
            <button key={p} onClick={() => setPriority(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                priority === p ? 'bg-sky-600 text-white' : 'bg-slate-700 text-gray-400'
              }`}>
              P{p}
            </button>
          ))}
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
              placeholder="List (e.g. Work)" className={inputCls} list="add-lists" />
            <datalist id="add-lists">
              {(lists || []).map(l => <option key={l} value={l} />)}
            </datalist>
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

// ─── Search Bar ───────────────────────────────────────────────────────────────

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

// ─── Main Mobile App ──────────────────────────────────────────────────────────

export default function MobileApp({ store }) {
  const [locale, setLocale] = useState(() => navigator.language?.startsWith('ru') ? 'ru' : 'en')
  const t = useTranslation(locale)
  const [syncLog, setSyncLog] = useState([])

  const [filter, setFilter] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarDate, setCalendarDate] = useState(null)
  const [gdriveConnected, setGdriveConnected] = useState(false)
  const [showGdriveSetup, setShowGdriveSetup] = useState(false)
  const [gdriveClientId, setGdriveClientId] = useState('')
  const [gdriveClientSecret, setGdriveClientSecret] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [undoAction, setUndoAction] = useState(null) // { label, undo: () => void }
  const undoTimerRef = useRef(null)

  const addSyncLog = (msg) => {
    const ts = new Date().toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setSyncLog(prev => [...prev, `[${ts}] ${msg}`])
  }

  // Check gdrive connection and load last sync on mount
  useEffect(() => {
    store.gdriveGetConfig?.().then(cfg => {
      if (cfg?.hasToken) setGdriveConnected(true)
      if (cfg?.clientId) setGdriveClientId(cfg.clientId)
    })
    if (store.metaSettings?.last_sync) setLastSync(store.metaSettings.last_sync)
  }, [store, store.metaSettings])

  // React to OAuth redirect completing in browserStore
  useEffect(() => {
    if (store.gdriveJustConnected) setGdriveConnected(true)
  }, [store.gdriveJustConnected])

  const { tasks } = store
  const today = localIsoDate(new Date())

  // Filtered + searched tasks
  const filtered = useMemo(() => {
    let r = tasks
    if (filter) r = r.filter(t => t.status === filter)
    if (calendarDate) r = r.filter(t => t.due === calendarDate)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      r = r.filter(t => t.title.toLowerCase().includes(q))
    }
    return r
  }, [tasks, filter, calendarDate, searchQuery])

  // Counts
  const counts = useMemo(() => ({
    all: tasks.length,
    inbox: tasks.filter(t => t.status === 'inbox').length,
    active: tasks.filter(t => t.status === 'active').length,
    done: tasks.filter(t => t.status === 'done').length,
  }), [tasks])

  // Overdue tasks
  const overdueTasks = useMemo(() =>
    filtered.filter(t => t.due && t.due < today && t.status !== 'done' && t.status !== 'cancelled'),
    [filtered, today]
  )
  const regularTasks = useMemo(() =>
    filtered.filter(t => !(t.due && t.due < today && t.status !== 'done' && t.status !== 'cancelled')),
    [filtered, today]
  )

  const handleCycle = useCallback((id) => {
    store.bulkCycle(new Set([id]))
  }, [store])

  const handleAdd = useCallback((data) => {
    store.addTask(data)
  }, [store])

  const showUndo = useCallback((label, undoFn) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoAction({ label, undo: undoFn })
    undoTimerRef.current = setTimeout(() => setUndoAction(null), 5000)
  }, [])

  const handleComplete = useCallback((id) => {
    const task = store.tasks.find(t => t.id === id)
    const prevStatus = task?.status || 'active'
    store.bulkStatus(new Set([id]), 'done')
    showUndo(
      locale === 'ru' ? 'Задача завершена' : 'Task completed',
      () => store.bulkStatus(new Set([id]), prevStatus)
    )
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
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" data-testid="mobile-settings">
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700/50">
          <button onClick={() => setShowSettings(false)} className="p-1 -ml-1 text-gray-400 active:text-white">
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-base font-semibold">{locale === 'ru' ? 'Настройки' : 'Settings'}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Language */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">{locale === 'ru' ? 'Язык' : 'Language'}</div>
            <div className="flex gap-2">
              {['en', 'ru'].map(l => (
                <button key={l} onClick={() => setLocale(l)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${locale === l ? 'bg-sky-600 text-white' : 'bg-slate-800 text-gray-400 active:bg-slate-700'}`}>
                  {l === 'en' ? 'English' : 'Русский'}
                </button>
              ))}
            </div>
          </div>

          {/* Clear local storage */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-3">{locale === 'ru' ? 'Опасная зона' : 'Danger zone'}</div>
            <p className="text-xs text-gray-500 mb-3">
              {locale === 'ru'
                ? 'Удалит все задачи и справочники из локального хранилища. Настройки синхронизации сохранятся.'
                : 'Deletes all tasks and lookups from local storage. Sync settings are preserved.'}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder={locale === 'ru' ? 'Введите DELETE' : 'Type DELETE'}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
              />
              <button
                disabled={clearConfirmText !== 'DELETE'}
                onClick={async () => {
                  await store.clearAll()
                  setClearConfirmText('')
                  setShowSettings(false)
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  clearConfirmText === 'DELETE'
                    ? 'bg-red-600 text-white active:bg-red-700'
                    : 'bg-slate-800 text-gray-600 cursor-not-allowed'
                }`}>
                {locale === 'ru' ? 'Очистить' : 'Clear all'}
              </button>
            </div>
          </div>

          {/* About */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{locale === 'ru' ? 'О приложении' : 'About'}</div>
            <div className="text-xs text-gray-500">Task Orchestrator PWA v1.0.0</div>
          </div>
        </div>
      </div>
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
        <h1 className="text-base font-bold flex-1">Task Orchestrator</h1>
        {syncMsg && (
          <span className="text-[10px] text-emerald-400 mr-1">{syncMsg}</span>
        )}
        {store.gdriveSyncNow && gdriveConnected && (
          <button onClick={async () => {
            setSyncing(true); setSyncMsg(null)
            addSyncLog(t('sync.gdriveSyncing'))
            try {
              const r = await store.gdriveSyncNow()
              if (r) {
                setSyncMsg(`+${r.applied}`)
                setLastSync(new Date().toISOString())
                addSyncLog(t('sync.gdriveSynced').replace('{applied}', r.applied).replace('{outdated}', r.outdated).replace('{uploaded}', r.uploaded))
              }
            } catch (e) { setSyncMsg(t('sync.gdriveError')); addSyncLog(`${t('sync.gdriveError')}: ${e.message}`) }
            finally { setSyncing(false); setTimeout(() => setSyncMsg(null), 3000) }
          }} disabled={syncing}
            className={`p-1.5 rounded-lg text-gray-400 active:text-sky-400 ${syncing ? 'animate-spin' : ''}`}>
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

      {/* Search */}
      <SearchBar query={searchQuery} onChange={setSearchQuery} t={t} />

      {/* Filter chips */}
      <FilterBar filter={filter} onFilter={setFilter} counts={counts} t={t} />

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
                <div className="px-4 pt-1 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    {t('agenda.overdue')} ({overdueTasks.length})
                  </span>
                </div>
                {overdueTasks.map(task => (
                  <TaskItem key={task.id} task={task} onTap={setDetailId} onCycle={handleCycle} onComplete={handleComplete} onDelete={handleDelete} />
                ))}
                <div className="h-2" />
              </>
            )}
            {/* Regular tasks */}
            {regularTasks.map(task => (
              <TaskItem key={task.id} task={task} onTap={setDetailId} onCycle={handleCycle} onComplete={handleComplete} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {/* Undo toast */}
      {undoAction && (
        <div className="fixed bottom-24 left-4 right-4 z-30 flex items-center gap-3 bg-slate-700 rounded-xl px-4 py-3 shadow-lg shadow-black/30 animate-[fadeIn_0.2s_ease-out]">
          <span className="flex-1 text-sm text-gray-200">{undoAction.label}</span>
          <button onClick={() => {
            undoAction.undo()
            setUndoAction(null)
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
          }}
            className="px-3 py-1 rounded-lg text-sm font-semibold text-sky-400 bg-sky-600/20 active:bg-sky-600/30">
            {locale === 'ru' ? 'Отменить' : 'Undo'}
          </button>
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
      <AddTaskSheet open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} lists={store.lists} t={t} />

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

          {/* Calendar */}
          <button onClick={() => { setShowCalendar(true); setDrawerOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 active:bg-slate-700 mb-4">
            <Calendar size={16} className="text-sky-400" />
            <span className="flex-1 text-left">{locale === 'ru' ? 'Календарь' : 'Calendar'}</span>
          </button>

          {/* Clear calendar filter if active */}
          {calendarDate && (
            <button onClick={() => { setCalendarDate(null); setDrawerOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-amber-400 active:bg-slate-700 mb-4">
              <X size={14} />
              <span>Clear date filter: {calendarDate}</span>
            </button>
          )}

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
                    onClick={() => { setFilter(null); setSearchQuery(''); setDrawerOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 active:bg-slate-700">
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
                  <span key={tag} className="text-xs px-2 py-1 rounded-full bg-sky-500/15 text-sky-400">#{tag}</span>
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
