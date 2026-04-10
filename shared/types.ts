/**
 * Core type definitions for Task Orchestrator.
 *
 * These types serve as the single source of truth for the data model.
 * JS modules can reference them via JSDoc: @type {import('./types').Task}
 */

// ─── Entity IDs ─────────────────────────────────────────────────────────────

/** ULID-format string (26 chars, Crockford Base32) */
export type TaskId = string

/** ISO date string: YYYY-MM-DD */
export type ISODate = string

/** ISO datetime string: YYYY-MM-DDTHH:mm:ss.sssZ */
export type ISODateTime = string

// ─── Task ───────────────────────────────────────────────────────────────────

export type TaskStatus = 'inbox' | 'active' | 'done' | 'cancelled'
export type TaskPriority = 1 | 2 | 3 | 4

export interface Note {
  id: string
  content: string
  createdAt: ISODateTime
}

export interface Task {
  id: TaskId
  title: string
  status: TaskStatus
  priority: TaskPriority
  list: string | null
  due: ISODate | null
  dateStart: ISODate | null
  recurrence: string | null
  flowId: string | null
  dependsOn: TaskId[] | null
  tags: string[]
  personas: string[]
  url: string | null
  estimate: string | null
  postponed: number
  rtmSeriesId: string | null
  completedAt: ISODateTime | null
  updatedAt: ISODateTime | null
  deletedAt: ISODateTime | null
  deviceId: string | null
  lamportTs: number
  notes: Note[]
  subtasks: unknown[]
  createdAt: ISODateTime
}

// ─── Flow ───────────────────────────────────────────────────────────────────

export interface FlowMeta {
  description: string
  color: string
  deadline: ISODate | null
}

// ─── Store results ──────────────────────────────────────────────────────────

export interface BulkResult {
  activated: string[]
  skippedBlocked?: number
}

export interface ImportResult {
  imported: number
  skipped: number
}

export interface BackupInfo {
  name: string
  schemaVersion: number | null
  date: string | null
  path: string
}

// ─── Store API ──────────────────────────────────────────────────────────────

export interface StoreApi {
  // ── Data ────────────────────────────────────────────────────────────────
  tasks: Task[]
  lists: string[]
  tags: string[]
  flows: string[]
  flowMeta: Record<string, FlowMeta>
  personas: string[]

  // ── Task mutations ──────────────────────────────────────────────────────
  addTask(data: Partial<Task> & { title: string }, currentTasks: Task[]): Promise<void>
  updateTask(id: TaskId, changes: Partial<Task>, currentTasks: Task[]): Promise<string[]>
  bulkStatus(ids: Set<TaskId> | TaskId[], status: TaskStatus, currentTasks: Task[]): Promise<BulkResult>
  bulkCycle(ids: TaskId[], currentTasks: Task[]): Promise<BulkResult>
  bulkDelete(ids: Set<TaskId> | TaskId[], currentTasks: Task[]): Promise<void>
  bulkPriority(ids: Set<TaskId> | TaskId[], priority: TaskPriority, currentTasks: Task[]): Promise<void>
  bulkDueShift(ids: Set<TaskId> | TaskId[], currentTasks: Task[]): Promise<void>
  bulkSnooze(ids: TaskId[], days: number, months: number, currentTasks: Task[]): Promise<void>
  bulkAssignToday(ids: TaskId[], currentTasks: Task[]): Promise<void>

  // ── Flow mutations ──────────────────────────────────────────────────────
  updateFlow(name: string, changes: Partial<FlowMeta>): Promise<void>
  deleteFlow(name: string): Promise<void>

  // ── Import / export ─────────────────────────────────────────────────────
  importRtm(
    jsonData: unknown,
    options?: { includeCompleted?: boolean; onProgress?: (current: number, total: number) => void }
  ): Promise<ImportResult>
  clearAll(): Promise<void>
  loadDemoData(data: { tasks: Task[]; lists: string[]; tags: string[]; flows: string[]; personas: string[] }): Promise<void>

  // ── Undo ────────────────────────────────────────────────────────────────
  undo(onDone?: () => void): void
  canUndo: boolean

  // ── Settings ────────────────────────────────────────────────────────────
  metaSettings: Record<string, string> | null
  saveMeta(key: string, value: string): Promise<void>

  // ── DB management (SQLite store only) ───────────────────────────────────
  dbPath?: string
  revealDb?(): Promise<void>
  openNewDb?(): Promise<boolean>
  moveCurrentDb?(): Promise<void>

  // ── Backups (SQLite store only) ─────────────────────────────────────────
  createBackup?(): Promise<boolean>
  listBackups?(): Promise<BackupInfo[]>
  restoreBackup?(path: string): Promise<void>

  // ── URL handling ────────────────────────────────────────────────────────
  openUrl?(url: string): Promise<void>
}
