/**
 * Storage-agnostic business logic for task mutations.
 *
 * This module contains the core rules that must behave identically
 * in both the Tauri (SQLite) and PWA (IndexedDB) stores:
 *   - Status cycling with dependency blocking
 *   - Recurring task spawning on completion
 *   - Dependent task activation on completion
 *
 * All functions are either pure (no side-effects) or accept a storage
 * adapter (`ops`) so they can work with any persistence backend.
 *
 * Storage adapter interface (`ops`):
 *   getTask(id)                   → Promise<task | null>
 *   insertTask(task)              → Promise<void>
 *   findInboxDependents(taskId)   → Promise<[{id, title, dependsOn}]>
 *   isBlockerActive(taskId)       → Promise<boolean>  (true = not done)
 *   activateTask(id, lts, did)    → Promise<void>
 */

import { nextDue } from './recurrence.js'

// ─── Constants ──────────────────────────────────────────────────────────────

export const FULL_CYCLE    = ['inbox', 'active', 'done', 'cancelled']
export const BLOCKED_CYCLE = ['inbox', 'cancelled']

// ─── Pure functions ─────────────────────────────────────────────────────────

/**
 * Compute the next status in the cycle.
 * Blocked tasks skip 'active' and 'done'.
 */
export function computeNextCycleStatus(currentStatus, isBlocked) {
  const cycle = isBlocked ? BLOCKED_CYCLE : FULL_CYCLE
  const curIdx = cycle.indexOf(currentStatus)
  if (curIdx === -1) return cycle[0]
  return cycle[(curIdx + 1) % cycle.length]
}

/**
 * Build the next occurrence object for a recurring task.
 * Returns a new task object (not persisted) or null if not recurring / unknown pattern.
 *
 * Handles both SQL row (snake_case) and IDB record (camelCase) field names.
 */
export function buildNextOccurrence(task, generateId, lamportTs, deviceId) {
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

/**
 * Handle all side-effects when a task transitions to 'done':
 *   1. Spawn next occurrence if recurring
 *   2. Activate dependent tasks whose blockers are now satisfied
 *
 * Returns { spawned, activated } so the caller can handle sync logging.
 */
export async function handleTaskDone(ops, taskId, generateId, lamportTs, deviceId) {
  const result = { spawned: null, activated: [] }

  // 1. Spawn next occurrence
  const task = await ops.getTask(taskId)
  const nextTask = buildNextOccurrence(task, generateId, lamportTs, deviceId)
  if (nextTask) {
    await ops.insertTask(nextTask)
    result.spawned = nextTask
  }

  // 2. Activate dependents
  const dependents = await ops.findInboxDependents(taskId)
  for (const dep of dependents) {
    const depOn = dep.dependsOn ?? dep.depends_on
    const stillBlocked = await ops.isBlockerActive(depOn)
    if (!stillBlocked) {
      await ops.activateTask(dep.id, lamportTs, deviceId)
      result.activated.push({ id: dep.id, title: dep.title })
    }
  }

  return result
}

/**
 * Check whether a task is blocked by an unfinished dependency.
 */
export async function isTaskBlocked(ops, taskId) {
  const task = await ops.getTask(taskId)
  const dependsOn = task?.dependsOn ?? task?.depends_on
  if (!dependsOn) return false
  return ops.isBlockerActive(dependsOn)
}
