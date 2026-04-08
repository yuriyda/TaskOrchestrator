/**
 * StoreApi contract — defines the shape every store implementation must follow.
 *
 * Both useTauriTaskStore (SQLite) and useTaskStore (in-memory) should conform
 * to this interface. TypeScript migration will turn this into a proper .d.ts.
 *
 * @typedef {string} TaskId - ULID-format string (26 chars, Crockford Base32)
 *
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} content
 * @property {string} [title]
 * @property {string} createdAt - ISO datetime
 *
 * @typedef {Object} Task
 * @property {TaskId} id
 * @property {string} title
 * @property {'inbox'|'active'|'done'|'cancelled'} status
 * @property {1|2|3|4} priority
 * @property {string|null} list
 * @property {string|null} due - ISO date (YYYY-MM-DD) or null
 * @property {string|null} dateStart - ISO date or null
 * @property {string|null} recurrence
 * @property {string|null} flowId
 * @property {string|null} dependsOn - TaskId or null
 * @property {string[]} tags
 * @property {string[]} personas
 * @property {string|null} url
 * @property {string|null} estimate
 * @property {number} postponed
 * @property {string|null} rtmSeriesId
 * @property {string|null} completedAt - ISO datetime or null
 * @property {string|null} updatedAt - ISO datetime or null
 * @property {string|null} deletedAt - ISO datetime or null
 * @property {string|null} deviceId
 * @property {Note[]} notes
 * @property {any[]} subtasks
 * @property {string} createdAt - ISO datetime
 *
 * @typedef {Object} FlowMeta
 * @property {string} description
 * @property {string} color
 * @property {string|null} deadline
 *
 * @typedef {Object} BulkResult
 * @property {string[]} activated - names of auto-activated tasks
 * @property {number} [skippedBlocked] - count of skipped blocked tasks
 *
 * @typedef {Object} ImportResult
 * @property {number} imported
 * @property {number} skipped
 *
 * @typedef {Object} StoreApi
 * @property {Task[]} tasks
 * @property {string[]} lists
 * @property {string[]} tags
 * @property {string[]} flows
 * @property {Object.<string, FlowMeta>} flowMeta
 * @property {string[]} personas
 *
 * @property {(data: Partial<Task> & {title: string}, currentTasks: Task[]) => Promise<void>} addTask
 * @property {(id: TaskId, changes: Partial<Task>, currentTasks: Task[]) => Promise<string[]>} updateTask - returns activated task names
 * @property {(ids: Set<TaskId>|TaskId[], status: string, currentTasks: Task[]) => Promise<BulkResult>} bulkStatus
 * @property {(ids: TaskId[], currentTasks: Task[]) => Promise<BulkResult>} bulkCycle
 * @property {(ids: Set<TaskId>|TaskId[], currentTasks: Task[]) => Promise<void>} bulkDelete
 * @property {(ids: Set<TaskId>|TaskId[], priority: number, currentTasks: Task[]) => Promise<void>} bulkPriority
 * @property {(ids: Set<TaskId>|TaskId[], currentTasks: Task[]) => Promise<void>} bulkDueShift
 * @property {(ids: TaskId[], days: number, months: number, currentTasks: Task[]) => Promise<void>} bulkSnooze
 * @property {(ids: TaskId[], currentTasks: Task[]) => Promise<void>} bulkAssignToday
 *
 * @property {(name: string, changes: Partial<FlowMeta>) => Promise<void>} updateFlow
 * @property {(name: string) => Promise<void>} deleteFlow
 *
 * @property {(jsonData: Object, options?: {includeCompleted?: boolean, onProgress?: Function}) => Promise<ImportResult>} importRtm
 * @property {() => Promise<void>} clearAll
 * @property {(data: Object) => Promise<void>} loadDemoData
 *
 * @property {(onDone?: Function) => void} undo
 * @property {boolean} canUndo
 *
 * @property {Object|null} metaSettings
 * @property {(key: string, value: string) => Promise<void>} saveMeta
 *
 * @property {string} dbPath
 * @property {() => Promise<void>} revealDb
 * @property {() => Promise<boolean>} openNewDb
 * @property {() => Promise<void>} moveCurrentDb
 *
 * @property {() => Promise<boolean>} createBackup
 * @property {() => Promise<Array>} listBackups
 * @property {(path: string) => Promise<void>} restoreBackup
 *
 * @property {(url: string) => Promise<void>} openUrl
 */

// URL allowlist for openUrl — prevents opening dangerous schemes
const ALLOWED_SCHEMES = ['https:', 'http:']

/**
 * Validates a URL against the allowlist of safe schemes.
 * @param {string} url
 * @returns {boolean}
 */
export function isUrlAllowed(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return ALLOWED_SCHEMES.includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Wraps a raw openUrl function with scheme validation.
 * Rejects file://, javascript:, data:, mailto: etc.
 * @param {(url: string) => Promise<void>} rawOpenUrl
 * @returns {(url: string) => Promise<void>}
 */
export function createSafeOpenUrl(rawOpenUrl) {
  return async (url) => {
    if (!isUrlAllowed(url)) {
      console.warn('[openUrl] Blocked URL with disallowed scheme:', url)
      return
    }
    return rawOpenUrl(url)
  }
}
