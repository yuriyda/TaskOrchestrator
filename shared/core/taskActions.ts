/**
 * @file taskActions.ts
 * Storage-agnostic business logic for task mutations.
 *
 * This module contains the core rules that must behave identically
 * in both the Tauri (SQLite) and PWA (IndexedDB) stores:
 *   - Status cycling with dependency blocking
 *   - Recurring task spawning on completion
 *   - Dependent task activation on completion
 *   - Spawn cleanup when a completion is reverted
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
  /** Soft-delete a task (deleted_at = now, bump lamport/device). */
  softDeleteTask?(id: string, lts: number, did: string): Promise<void>
  /** Overwrite all fields of an existing (soft-deleted) row with a fresh spawn, clearing deleted_at. */
  resurrectTask?(task: any): Promise<void>
}

interface TaskDoneResult {
  spawned: any | null
  /** True when the spawn reused a previously soft-deleted row (same deterministic id). */
  resurrected: boolean
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

/**
 * Deterministic id for the next occurrence spawned by completing `parentId`.
 *
 * Two devices completing the same task offline must produce the SAME spawn id,
 * so state-based sync converges the two inserts into one row instead of
 * keeping two duplicates (each with its own random ULID). The id is a
 * 128-bit cyrb128 hash of the parent id, encoded as 26 Crockford Base32
 * chars — same shape as a ULID, but derived, so it can be recomputed from
 * the parent at any time (used by handleTaskUndone to find the spawn).
 */
export function spawnIdFor(parentId: string): string {
  // cyrb128 — public-domain 128-bit non-cryptographic hash
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < parentId.length; i++) {
    const k = parentId.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  let n = (BigInt(h1 >>> 0) << 96n) | (BigInt(h2 >>> 0) << 64n) | (BigInt(h3 >>> 0) << 32n) | BigInt(h4 >>> 0)
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const out = new Array(26)
  for (let i = 25; i >= 0; i--) { out[i] = B32[Number(n & 31n)]; n >>= 5n }
  return out.join('')
}

/**
 * Build the next occurrence for a recurring task.
 * The id is deterministic (spawnIdFor) — see its doc for why.
 * `_generateId` is kept for signature compatibility but no longer used.
 */
export function buildNextOccurrence(
  task: any,
  _generateId: () => string,
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
    id:           spawnIdFor(String(task.id)),
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
  prevStatus?: string | null,
): Promise<TaskDoneResult> {
  const result: TaskDoneResult = { spawned: null, resurrected: false, activated: [] }

  // Guard: an update that re-sends status='done' on an already-done task
  // (edit-dialog save, redo, repeated context-menu "Done") must not spawn
  // another occurrence or re-activate dependents.
  if (prevStatus === 'done') return result

  const task = await ops.getTask(taskId)
  const nextTask = buildNextOccurrence(task, generateId, lamportTs, deviceId)
  if (nextTask) {
    const existing = await ops.getTask(nextTask.id)
    const existingDeleted = existing ? (existing.deletedAt ?? existing.deleted_at) : null
    if (!existing) {
      await ops.insertTask(nextTask)
      result.spawned = nextTask
    } else if (existingDeleted && ops.resurrectTask) {
      // The spawn row was soft-deleted by a completion revert — bring it back
      // with freshly computed dates instead of leaving the chain broken.
      await ops.resurrectTask(nextTask)
      result.spawned = nextTask
      result.resurrected = true
    }
    // else: a live spawn already exists (e.g. the task was completed on another
    // device and synced over) — nothing to do, duplicates must not be created.
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

/**
 * Completion revert (done → any other status): soft-delete the occurrence that
 * was spawned by the completion, but only while it is still untouched — active,
 * not deleted, and never edited since it was created (updatedAt === createdAt).
 * A spawn the user already edited or completed stays.
 * Returns the removed spawn id, or null when nothing was removed.
 */
export async function handleTaskUndone(
  ops: StorageOps,
  taskId: string,
  lamportTs: number,
  deviceId: string,
): Promise<{ removedSpawn: string | null }> {
  if (!ops.softDeleteTask) return { removedSpawn: null }
  const task = await ops.getTask(taskId)
  if (!task || !task.recurrence) return { removedSpawn: null }

  const spawnId = spawnIdFor(String(task.id ?? taskId))
  const spawn = await ops.getTask(spawnId)
  if (!spawn) return { removedSpawn: null }

  const deleted   = spawn.deletedAt ?? spawn.deleted_at
  const createdAt = spawn.createdAt ?? spawn.created_at
  const updatedAt = spawn.updatedAt ?? spawn.updated_at
  const untouched = spawn.status === 'active' && !!createdAt && updatedAt === createdAt
  if (deleted || !untouched) return { removedSpawn: null }

  await ops.softDeleteTask(spawnId, lamportTs, deviceId)
  return { removedSpawn: spawnId }
}

// ─── Duplicate cleanup (one-shot data fix) ──────────────────────────────────

/**
 * Find redundant duplicates among active recurring instances of the same
 * RTM series. Historical sources of such duplicates:
 *   - RTM export contained several incomplete instances of one series
 *     ("every"-type repeats in RTM generate the next occurrence on schedule
 *     even when the current one is not completed) — all were imported;
 *   - completing the same task on two devices before sync converged
 *     (spawn ids were random pre-2.6.0, so both spawns survived the merge);
 *   - re-completing an already-done task (fixed by the prevStatus guard).
 *
 * Within each group only the newest instance (by createdAt, tie-break by id)
 * is kept — the rest are returned for soft-deletion. Accepts both camelCase
 * (IDB) and snake_case (SQLite) rows.
 */
export function findRecurringDuplicates(tasks: any[]): string[] {
  const groups = new Map<string, any[]>()
  for (const t of tasks) {
    const seriesId = t.rtmSeriesId ?? t.rtm_series_id
    const deleted  = t.deletedAt ?? t.deleted_at
    if (!seriesId || deleted || t.status !== 'active' || !t.recurrence) continue
    const key = String(seriesId)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  const duplicates: string[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => {
      const ca = String(a.createdAt ?? a.created_at ?? '')
      const cb = String(b.createdAt ?? b.created_at ?? '')
      return cb.localeCompare(ca) || String(b.id).localeCompare(String(a.id))
    })
    for (let i = 1; i < group.length; i++) duplicates.push(String(group[i].id))
  }
  return duplicates
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
