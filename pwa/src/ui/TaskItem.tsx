import { useState, useRef } from 'react'
import { ChevronRight, CheckCircle2, Trash2, Circle, Repeat } from 'lucide-react'
import { localIsoDate } from '@shared/core/date.js'
import { humanRecurrence } from '@shared/core/recurrence.js'
import { STATUS_ICONS, STATUS_COLORS, OVERDUE_STRIPE_CLS, NORMAL_STRIPE_CLS } from './mobileConstants'

function TaskItem({ task, locale = 'en', onTap, onCycle, onComplete, onDelete }) {
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
    <div className="mx-2 relative overflow-hidden rounded-xl">
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
        className={`flex flex-col gap-1 px-3 py-2.5 bg-slate-800/90 border-l-[3px] ${stripeCls} rounded-xl relative z-10`}>
        <div className={`text-sm leading-tight ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {task.title}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={(e) => { e.stopPropagation(); onCycle(task.id) }}
            className={`flex-shrink-0 p-0.5 -ml-0.5 ${STATUS_COLORS[task.status]}`}>
            <StatusIcon size={14} />
          </button>
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
              <Repeat size={8} />{humanRecurrence(task.recurrence, locale) || task.recurrence}
            </span>
          )}
          {task.list && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{task.list}</span>
          )}
          {(task.tags || []).slice(0, 2).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">#{tag}</span>
          ))}
          <ChevronRight size={12} className="text-gray-600 flex-shrink-0 ml-auto" />
        </div>
      </div>
    </div>
  )
}

export { TaskItem }
