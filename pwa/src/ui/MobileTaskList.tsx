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
          {p.regularTasks.map(task => (
            <TaskItem key={task.id} task={task} locale={p.locale}
              onTap={p.onTap} onCycle={p.onCycle} onComplete={p.onComplete} onDelete={p.onDelete} />
          ))}
        </div>
      )}
    </main>
  )
}
