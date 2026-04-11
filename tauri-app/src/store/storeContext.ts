/**
 * @file storeContext.ts
 * Shared context type for useTauriTaskStore domain modules.
 * Each extracted module receives this context to access the DB, device ID,
 * state setters, and common helpers without prop drilling.
 *
 * Rules:
 * - Never modify this type without updating ALL consuming modules.
 * - dbRef and deviceIdRef are React refs — access via .current.
 * - mutate() is the canonical way to perform task mutations with undo history.
 */
import type { MutableRefObject } from 'react'
import type { Task } from '../types'

interface DB {
  execute(sql: string, params?: any[]): Promise<any>
  select<T = any>(sql: string, params?: any[]): Promise<T[]>
  close(): Promise<void>
}

export interface StoreContext {
  dbRef: MutableRefObject<DB | null>
  deviceIdRef: MutableRefObject<string | null>
  mutate: (currentTasks: Task[], fn: (db: DB) => Promise<any>) => Promise<any>
  refreshRef: () => Promise<void>
  setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void
}
