import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { localIsoDate } from '@shared/core/date.js'
import { STATUS_ICONS, STATUS_COLORS } from './mobileConstants'

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

export { MobileCalendar }
