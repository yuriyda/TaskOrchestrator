/**
 * @file taskActions.ts
 * Storage-agnostic business logic for task mutations.
 *
 * This module contains the core rules that must behave identically
 * in both the Tauri (SQLite) and PWA (IndexedDB) stores:
 *   - Status cycling with dependency blocking
 *   - Recurring task spawning on completion
 *   - Dependent task activation on completion
 */

import { nextDue } from './recurrence.js'
import type { TaskStatus } from '../types'

// ─── Storage adapter interface ─────────────────────────────────────────────

interface StorageOps {
  getTask(id: string): Promise<any | null>
  insertTask(task: any): Promise<void>
  findInboxDependents(taskId: string): Promise<Array<{ id: string; title: string; dependsOn?: string; depends_on?: string }>>
  isBlockerActive(taskId: string): Promise<boolean>
  activateTask(id: string, lts: number, did: string): Promise<void>
}

interface TaskDoneResult {
  spawned: any | null
  activated: Array<{ id: string; title: string }>
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const FULL_CYCLE: TaskStatus[]    = ['inbox', 'active', 'done', 'cancelled']
export const BLOCKED_CYCLE: TaskStatus[] = ['inbox', 'cancelled']

// ─── Pure functions ─────────────────────────────────────────────────────────

export function computeNextCycleStatus(currentStatus: string, isBlocked: boolean): TaskStatus {
  const cycle = isBlocked ? BLOCKED_CYCLE : FULL_CYCLE
  const curIdx = cycle.indexOf(currentStatus as TaskStatus)
  if (curIdx === -1) return cycle[0]
  return cycle[(curIdx + 1) % cycle.length]
}

export function buildNextOccurrence(
  task: any,
  generateId: () => string,
  lamportTs: number,
  deviceId: string,
): any | null {
  if (!task || !task.recurrence) return null
  const newDue = nextDue(task.due, task.recurrence)
  if (!newDue) return null

  const tags     = Array.isArray(task.tags)     ? [...task.tags]     : JSON.parse(task.tags     || '[]')
  const personas = Array.isArray(task.personas) ? [...task.personas] : JSON.parse(task.personas || '[]')
  const now = new Date().toISOString()

  return {
    id:           generateId(),
    title:        task.title,
    status:       'active',
    priority:     task.priority || 4,
    list:         task.list ?? task.list_name ?? null,
    due:          newDue,
    recurrence:   task.recurrence,
    flowId:       task.flowId ?? task.flow_id ?? null,
    dependsOn:    null,
    tags,
    personas,
    url:          task.url      || null,
    dateStart:    null,
    estimate:     task.estimate || null,
    postponed:    0,
    rtmSeriesId:  task.rtmSeriesId ?? task.rtm_series_id ?? null,
    completedAt:  null,
    createdAt:    now,
    updatedAt:    now,
    deletedAt:    null,
    lamportTs:    lamportTs || 0,
    deviceId:     deviceId  || null,
  }
}

// ─── Orchestrator functions (use storage adapter) ───────────────────────────

export async function handleTaskDone(
  ops: StorageOps,
  taskId: string,
  generateId: () => string,
  lamportTs: number,
  deviceId: string,
): Promise<TaskDoneResult> {
  const result: TaskDoneResult = { spawned: null, activated: [] }

  const task = await ops.getTask(taskId)
  const nextTask = buildNextOccurrence(task, generateId, lamportTs, deviceId)
  if (nextTask) {
    await ops.insertTask(nextTask)
    result.spawned = nextTask
  }

  const dependents = await ops.findInboxDependents(taskId)
  for (const dep of dependents) {
    const depIds: string[] = Array.isArray(dep.dependsOn) ? dep.dependsOn :
      dep.dependsOn ? [dep.dependsOn] :
      dep.depends_on ? [dep.depends_on] : []
    if (!depIds.length) continue
    // Activate only when ALL blockers are done
    let allDone = true
    for (const dId of depIds) {
      if (await ops.isBlockerActive(dId)) { allDone = false; break }
    }
    if (allDone) {
      await ops.activateTask(dep.id, lamportTs, deviceId)
      result.activated.push({ id: dep.id, title: dep.title })
    }
  }

  return result
}

export async function isTaskBlocked(ops: StorageOps, taskId: string): Promise<boolean> {
  const task = await ops.getTask(taskId)
  const rawDeps = task?.dependsOn ?? task?.depends_on
  const deps: string[] = Array.isArray(rawDeps) ? rawDeps :
    typeof rawDeps === 'string' && rawDeps ? JSON.parse(rawDeps) : []
  if (!deps.length) return false
  for (const depId of deps) {
    if (await ops.isBlockerActive(depId)) return true
  }
  return false
}
