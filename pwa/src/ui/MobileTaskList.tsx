/**
 * @file MobileTaskList.tsx
 * @description Main task list render: empty state, overdue section, regular
 * tasks. Extracted from MobileApp to let the orchestrator be a thin shell.
 */
import { TaskItem } from './TaskItem'

interface Props {
  t: (key: string) => string
  locale: string
  filtered: any[]
  overdueTasks: any[]
  regularTasks: any[]
  searchQuery: string
  groupByFlow?: boolean
  flowMeta?: Record<string, { color?: string }>
  onTap: (id: string) => void
  onCycle: (id: string) => void
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

export function MobileTaskList(p: Props) {
  return (
    <main className="flex-1 overflow-y-auto pb-24" data-testid="task-list">
      {p.filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-20 text-sm">
          {p.searchQuery
            ? (p.t('search.noResults') || 'No tasks found')
            : (p.t('mobile.emptyState') || 'No tasks. Tap + to add one.')}
        </div>
      ) : (
        <div className="space-y-1.5 py-2">
          {p.overdueTasks.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                  {p.t('agenda.overdue')} ({p.overdueTasks.length})
                </span>
              </div>
              {p.overdueTasks.map(task => (
                <TaskItem key={task.id} task={task} locale={p.locale}
                  onTap={p.onTap} onCycle={p.onCycle} onComplete={p.onComplete} onDelete={p.onDelete} />
              ))}
              <div className="h-2" />
            </>
          )}
          {(() => {
            if (!p.groupByFlow) {
              return p.regularTasks.map(task => (
                <TaskItem key={task.id} task={task} locale={p.locale}
                  onTap={p.onTap} onCycle={p.onCycle} onComplete={p.onComplete} onDelete={p.onDelete} />
              ))
            }
            const rows: any[] = []
            let buf: { flowId: string; color: string; items: any[] } | null = null
            const flush = () => {
              if (!buf || buf.items.length === 0) { buf = null; return }
              const c = buf.color
              rows.push(
                <div key={`flow-${buf.flowId}-${rows.length}`}
                     className="relative pl-2 py-1 my-1 mx-2"
                     style={{ borderLeft: `2px solid ${c}80`, borderTop: `2px solid ${c}80`, borderBottom: `2px solid ${c}80`, borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px' }}>
                  <div className="text-[9px] uppercase tracking-wider font-semibold mb-1 ml-1" style={{ color: c }}>{buf.flowId}</div>
                  <div className="space-y-1.5">{buf.items}</div>
                </div>
              )
              buf = null
            }
            p.regularTasks.forEach(task => {
              const item = (
                <TaskItem key={task.id} task={task} locale={p.locale}
                  onTap={p.onTap} onCycle={p.onCycle} onComplete={p.onComplete} onDelete={p.onDelete} />
              )
              if (task.flowId) {
                if (!buf || buf.flowId !== task.flowId) {
                  flush()
                  const color = p.flowMeta?.[task.flowId]?.color || '#38bdf8'
                  buf = { flowId: task.flowId, color, items: [] }
                }
                buf.items.push(item)
              } else {
                flush()
                rows.push(item)
              }
            })
            flush()
            return rows
          })()}
        </div>
      )}
    </main>
  )
}
