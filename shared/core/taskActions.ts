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

// ─── Cycle detection ────────────────────────────────────────────────────────

/**
 * Check if adding a dependency (taskId depends on newDepId) would create a cycle.
 * Uses DFS from newDepId following dependsOn edges to see if taskId is reachable.
 */
export function wouldCreateCycle(
  tasks: Array<{ id: string; dependsOn?: string[] | null }>,
  taskId: string,
  newDepId: string,
): boolean {
  if (taskId === newDepId) return true
  const depMap = new Map<string, string[]>()
  for (const t of tasks) {
    depMap.set(String(t.id), Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [])
  }
  // DFS: can we reach taskId starting from newDepId by following dependsOn?
  // If newDepId depends on X which depends on ... which depends on taskId → cycle
  const visited = new Set<string>()
  const stack = [newDepId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === taskId) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const dep of depMap.get(current) ?? []) {
      stack.push(dep)
    }
  }
  return false
}

export async function isTaskBlocked(ops: StorageOps, taskId: string): Promise<boolean> {
  const task = await ops.getTask(taskId)
  const rawDeps = task?.dependsOn ?? task?.depends_on
  let deps: string[] = []
  if (Array.isArray(rawDeps)) {
    deps = rawDeps
  } else if (typeof rawDeps === 'string' && rawDeps) {
    try { const p = JSON.parse(rawDeps); deps = Array.isArray(p) ? p : [p] }
    catch { deps = [rawDeps] }
  }
  if (!deps.length) return false
  for (const depId of deps) {
    if (await ops.isBlockerActive(depId)) return true
  }
  return false
}
