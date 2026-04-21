/**
 * Day Planner store — CRUD operations for day_plans and day_plan_slots.
 * Separate from the main task store to keep concerns clean.
 * All functions receive a db adapter, device_id, and lamport helpers.
 */

import { ulid } from '../ulid.js'
import { logChange, nextLamport } from './helpers.js'
import { localIsoDate } from '../core/date.js'
import { PLANNER_DAY_START_DEFAULT, PLANNER_DAY_END_DEFAULT, PLANNER_SLOT_STEP_DEFAULT, DEFAULT_TASK_ESTIMATE_MIN } from '../core/constants.js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Plan {
  id: string
  date: string
  dayStartHour: number
  dayEndHour: number
  createdAt: string
  updatedAt: string
  deviceId: string
  lamportTs: number
}

export interface Slot {
  id: string
  planId: string
  taskId: string | null
  title: string | null
  startTime: string
  endTime: string
  slotType: 'task' | 'blocked'
  sortOrder: number
  recurrence: string | null
  createdAt: string
  deviceId: string
  lamportTs: number
}

interface PlanDefaults {
  dayStartHour?: number
  dayEndHour?: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rowToPlan(row: any): Plan {
  return {
    id:           row.id,
    date:         row.date,
    dayStartHour: row.day_start_hour,
    dayEndHour:   row.day_end_hour,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    deviceId:     row.device_id,
    lamportTs:    row.lamport_ts,
  }
}

function rowToSlot(row: any): Slot {
  return {
    id:        row.id,
    planId:    row.plan_id,
    taskId:    row.task_id || null,
    title:     row.title || null,
    startTime: row.start_time,
    endTime:   row.end_time,
    slotType:  row.slot_type,
    sortOrder:  row.sort_order,
    recurrence: row.recurrence || null,
    createdAt:  row.created_at,
    deviceId:   row.device_id,
    lamportTs:  row.lamport_ts,
  }
}

// ─── Plan CRUD ──────────────────────────────────────────────────────────────

/** Get or create a plan for the given date. Returns the plan object. */
export async function getOrCreatePlan(db: any, date: string, deviceId: string, defaults: PlanDefaults = {}): Promise<Plan> {
  const [existing] = await db.select('SELECT * FROM day_plans WHERE date = ?', [date])
  if (existing) return rowToPlan(existing)

  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  const plan: Plan = {
    id:           ulid(),
    date,
    dayStartHour: defaults.dayStartHour ?? PLANNER_DAY_START_DEFAULT,
    dayEndHour:   defaults.dayEndHour ?? PLANNER_DAY_END_DEFAULT,
    createdAt:    now,
    updatedAt:    now,
    deviceId,
    lamportTs:    lts,
  }
  await db.execute(
    'INSERT INTO day_plans (id, date, day_start_hour, day_end_hour, created_at, updated_at, device_id, lamport_ts) VALUES (?,?,?,?,?,?,?,?)',
    [plan.id, plan.date, plan.dayStartHour, plan.dayEndHour, plan.createdAt, plan.updatedAt, plan.deviceId, plan.lamportTs]
  )
  await logChange(db, 'day_plans', plan.id, 'insert', plan, lts, deviceId)
  return plan
}

/** Fetch a plan by date. Returns null if not found. */
export async function getPlanByDate(db: any, date: string): Promise<Plan | null> {
  const [row] = await db.select('SELECT * FROM day_plans WHERE date = ?', [date])
  return row ? rowToPlan(row) : null
}

/** Update plan hours. */
export async function updatePlanHours(db: any, planId: string, dayStartHour: number, dayEndHour: number, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  await db.execute(
    'UPDATE day_plans SET day_start_hour=?, day_end_hour=?, updated_at=?, lamport_ts=?, device_id=? WHERE id=?',
    [dayStartHour, dayEndHour, now, lts, deviceId, planId]
  )
  await logChange(db, 'day_plans', planId, 'update', { dayStartHour, dayEndHour }, lts, deviceId)
}

// ─── Slot CRUD ──────────────────────────────────────────────────────────────

/** Fetch all slots for a plan (own slots only). Cleans up orphaned task slots. */
export async function getSlotsByPlan(db: any, planId: string): Promise<Slot[]> {
  // Remove orphan slots: task-type slots where task was deleted (task_id set to NULL by FK)
  await db.execute("DELETE FROM day_plan_slots WHERE plan_id = ? AND slot_type = 'task' AND task_id IS NULL", [planId])
  const rows = await db.select(
    'SELECT * FROM day_plan_slots WHERE plan_id = ? ORDER BY start_time, sort_order',
    [planId]
  )
  return rows.map(rowToSlot)
}

/**
 * Fetch effective slots for a date: own slots + recurring blocked slots from other days.
 * Recurring slots are returned with their ORIGINAL id (edits/deletes operate on the original).
 */
export async function getEffectiveSlots(db: any, date: string, planId: string): Promise<Slot[]> {
  // Clean up orphan task slots (task deleted → FK set task_id to NULL)
  await db.execute("DELETE FROM day_plan_slots WHERE plan_id = ? AND slot_type = 'task' AND task_id IS NULL", [planId])
  // Also clean up slots referencing soft-deleted tasks
  await db.execute(
    "DELETE FROM day_plan_slots WHERE plan_id = ? AND slot_type = 'task' AND task_id IN (SELECT id FROM tasks WHERE deleted_at IS NOT NULL)",
    [planId]
  )
  // 1. Own slots for this plan
  const ownRows = await db.select(
    'SELECT * FROM day_plan_slots WHERE plan_id = ? ORDER BY start_time, sort_order',
    [planId]
  )
  const own = ownRows.map(rowToSlot)

  // 2. Recurring blocked slots from other plans
  let recurring: Slot[] = []
  try {
    const recRows = await db.select(
      `SELECT s.*, p.date as plan_date FROM day_plan_slots s
       JOIN day_plans p ON s.plan_id = p.id
       WHERE s.slot_type = 'blocked' AND s.recurrence IS NOT NULL AND p.date != ?`,
      [date]
    )

    const targetDate = new Date(date + 'T12:00:00')
    const targetDay = targetDate.getDay() // 0=Sun

    // Deduplicate: if own plan already has a slot with same title+time, skip
    const ownKeys = new Set(own.map((s: Slot) => `${s.title}|${s.startTime}|${s.endTime}`))

    for (const row of recRows) {
      const sourceDate = new Date(row.plan_date + 'T12:00:00')
      const sourceDay = sourceDate.getDay()
      const diffDays = Math.round((targetDate.getTime() - sourceDate.getTime()) / 86400000)

      let applies = false
      if (row.recurrence === 'daily') applies = true
      else if (row.recurrence === 'weekly') applies = (sourceDay === targetDay)
      else if (row.recurrence === 'biweekly') applies = (sourceDay === targetDay && diffDays % 14 === 0)

      if (!applies) continue
      const key = `${row.title}|${row.start_time}|${row.end_time}`
      if (ownKeys.has(key)) continue
      ownKeys.add(key)

      recurring.push(rowToSlot(row))
    }
  } catch (_) { /* recurrence column may not exist */ }

  return [...own, ...recurring].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/** Fetch all slots for a date (convenience — resolves plan first). */
export async function getSlotsByDate(db: any, date: string): Promise<Slot[]> {
  const plan = await getPlanByDate(db, date)
  if (!plan) return []
  return getEffectiveSlots(db, date, plan.id)
}

/** Get all task IDs that have at least one slot in any plan. Returns a Set. */
export async function getPlannedTaskIds(db: any): Promise<Set<string>> {
  const rows = await db.select('SELECT DISTINCT task_id FROM day_plan_slots WHERE task_id IS NOT NULL AND slot_type = ?', ['task'])
  return new Set(rows.map((r: any) => r.task_id))
}

const SLOT_INSERT = 'INSERT INTO day_plan_slots (id, plan_id, task_id, title, start_time, end_time, slot_type, sort_order, recurrence, created_at, device_id, lamport_ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'

/** Add a task slot to the plan. Returns the new slot. */
export async function addTaskSlot(db: any, planId: string, taskId: string, startTime: string, endTime: string, deviceId: string): Promise<Slot> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  const slot: Slot = {
    id: ulid(), planId, taskId, title: null, startTime, endTime,
    slotType: 'task', sortOrder: 0, recurrence: null, createdAt: now, deviceId, lamportTs: lts,
  }
  await db.execute(SLOT_INSERT, [slot.id, slot.planId, slot.taskId, slot.title, slot.startTime, slot.endTime, slot.slotType, slot.sortOrder, slot.recurrence, slot.createdAt, slot.deviceId, slot.lamportTs])
  await db.execute('UPDATE day_plans SET updated_at=? WHERE id=?', [now, planId])
  await logChange(db, 'day_plan_slots', slot.id, 'insert', slot, lts, deviceId)
  return slot
}

/** Add a blocked slot to the plan. Returns the new slot. */
export async function addBlockedSlot(db: any, planId: string, title: string, startTime: string, endTime: string, deviceId: string, recurrence: string | null = null): Promise<Slot> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  const slot: Slot = {
    id: ulid(), planId, taskId: null, title: title || '', startTime, endTime,
    slotType: 'blocked', sortOrder: 0, recurrence, createdAt: now, deviceId, lamportTs: lts,
  }
  await db.execute(SLOT_INSERT, [slot.id, slot.planId, slot.taskId, slot.title, slot.startTime, slot.endTime, slot.slotType, slot.sortOrder, slot.recurrence, slot.createdAt, slot.deviceId, slot.lamportTs])
  await db.execute('UPDATE day_plans SET updated_at=? WHERE id=?', [now, planId])
  await logChange(db, 'day_plan_slots', slot.id, 'insert', slot, lts, deviceId)
  return slot
}

/** Move a slot to a new time. */
export async function moveSlot(db: any, slotId: string, startTime: string, endTime: string, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  await db.execute(
    'UPDATE day_plan_slots SET start_time=?, end_time=?, lamport_ts=?, device_id=? WHERE id=?',
    [startTime, endTime, lts, deviceId, slotId]
  )
  // Update parent plan's updated_at
  const [slot] = await db.select('SELECT plan_id FROM day_plan_slots WHERE id=?', [slotId])
  if (slot) await db.execute('UPDATE day_plans SET updated_at=? WHERE id=?', [now, slot.plan_id])
  await logChange(db, 'day_plan_slots', slotId, 'update', { startTime, endTime }, lts, deviceId)
}

/** Resize a slot (change endTime only). */
export async function resizeSlot(db: any, slotId: string, endTime: string, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  await db.execute(
    'UPDATE day_plan_slots SET end_time=?, lamport_ts=?, device_id=? WHERE id=?',
    [endTime, lts, deviceId, slotId]
  )
  const [slot] = await db.select('SELECT plan_id FROM day_plan_slots WHERE id=?', [slotId])
  if (slot) await db.execute('UPDATE day_plans SET updated_at=? WHERE id=?', [now, slot.plan_id])
  await logChange(db, 'day_plan_slots', slotId, 'update', { endTime }, lts, deviceId)
}

/** Remove a slot from the plan. */
export async function removeSlot(db: any, slotId: string, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  const now = new Date().toISOString()
  const [slot] = await db.select('SELECT plan_id FROM day_plan_slots WHERE id=?', [slotId])
  await db.execute('DELETE FROM day_plan_slots WHERE id=?', [slotId])
  if (slot) await db.execute('UPDATE day_plans SET updated_at=? WHERE id=?', [now, slot.plan_id])
  await logChange(db, 'day_plan_slots', slotId, 'delete', null, lts, deviceId)
}

/** Update a blocked slot title. */
export async function updateSlotTitle(db: any, slotId: string, title: string, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  await db.execute(
    'UPDATE day_plan_slots SET title=?, lamport_ts=?, device_id=? WHERE id=?',
    [title, lts, deviceId, slotId]
  )
  await logChange(db, 'day_plan_slots', slotId, 'update', { title }, lts, deviceId)
}

/** Update a slot's recurrence. */
export async function updateSlotRecurrence(db: any, slotId: string, recurrence: string | null, deviceId: string): Promise<void> {
  const lts = await nextLamport(db, deviceId)
  await db.execute(
    'UPDATE day_plan_slots SET recurrence=?, lamport_ts=?, device_id=? WHERE id=?',
    [recurrence, lts, deviceId, slotId]
  )
  await logChange(db, 'day_plan_slots', slotId, 'update', { recurrence }, lts, deviceId)
}

// ─── Time utilities ─────────────────────────────────────────────────────────

/** Parse "HH:MM" → minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Minutes from midnight → "HH:MM". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Snap minutes to nearest grid step. */
export function snapToGrid(minutes: number, step: number = PLANNER_SLOT_STEP_DEFAULT): number {
  return Math.round(minutes / step) * step
}

/** Calculate default end time given start time and default duration (60 min). */
export function defaultEndTime(startTime: string, durationMin: number = DEFAULT_TASK_ESTIMATE_MIN): string {
  const startMin = timeToMinutes(startTime)
  return minutesToTime(startMin + durationMin)
}

/** Check if two time ranges overlap. */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = timeToMinutes(startA), a1 = timeToMinutes(endA)
  const b0 = timeToMinutes(startB), b1 = timeToMinutes(endB)
  return a0 < b1 && b0 < a1
}

/** Get the week's date range (Mon–Sun) containing the given date. */
export function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()  // 0=Sun, 1=Mon, ...
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)

  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    dates.push(localIsoDate(date))
  }
  return dates
}
