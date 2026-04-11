/**
 * @file usePlannerOps.ts
 * Day Planner domain: state + CRUD operations for planner slots.
 * Extracted from useTauriTaskStore to reduce file size.
 *
 * Rules:
 * - This hook owns dayPlanSlots, currentPlan, plannedTaskIds state.
 * - It exposes setDayPlanSlots for external consumers (undo, bulkDelete).
 * - pushHistory must be called before any slot mutation that affects tasks.
 */
import { useState, useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { PLANNER_DAY_START_DEFAULT, PLANNER_DAY_END_DEFAULT } from '../core/constants.js'
import {
  getOrCreatePlan, getEffectiveSlots,
  addTaskSlot, addBlockedSlot, moveSlot, resizeSlot, removeSlot,
  updateSlotTitle, updateSlotRecurrence, updatePlanHours, getPlannedTaskIds,
} from './dayPlanner.js'

interface UsePlannerOpsParams {
  dbRef: MutableRefObject<any>
  deviceIdRef: MutableRefObject<string | null>
  pushHistory: (currentTasks: any[]) => void
}

export function usePlannerOps({ dbRef, deviceIdRef, pushHistory }: UsePlannerOpsParams) {
  const [dayPlanSlots, setDayPlanSlots] = useState<any[]>([])
  const [currentPlan, setCurrentPlan] = useState<any>(null)
  const [plannedTaskIds, setPlannedTaskIds] = useState<Set<string>>(new Set())

  const refreshPlannedTaskIds = useCallback(async () => {
    const db = dbRef.current
    if (!db) return
    setPlannedTaskIds(await getPlannedTaskIds(db))
  }, [])

  const plannerLoadDay = useCallback(async (date: string, defaults?: any) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    const plan = await getOrCreatePlan(db, date, did, defaults)
    const wantStart = defaults?.dayStartHour ?? PLANNER_DAY_START_DEFAULT
    const wantEnd = defaults?.dayEndHour ?? PLANNER_DAY_END_DEFAULT
    if (plan.dayStartHour !== wantStart || plan.dayEndHour !== wantEnd) {
      await updatePlanHours(db, plan.id, wantStart, wantEnd, did)
      plan.dayStartHour = wantStart
      plan.dayEndHour = wantEnd
    }
    const slots = await getEffectiveSlots(db, date, plan.id)
    setCurrentPlan({ ...plan })
    setDayPlanSlots(slots)
    return plan
  }, [])

  const plannerRefreshSlots = useCallback(async () => {
    const db = dbRef.current
    if (!db || !currentPlan) return
    const slots = await getEffectiveSlots(db, currentPlan.date, currentPlan.id)
    setDayPlanSlots(slots)
  }, [currentPlan])

  const plannerAddTaskSlot = useCallback(async (taskId: string, startTime: string, endTime: string, currentTasks: any[]) => {
    const db = dbRef.current
    if (!db || !currentPlan) return null
    const did = deviceIdRef.current
    pushHistory(currentTasks)
    const slot = await addTaskSlot(db, currentPlan.id, taskId, startTime, endTime, did)
    setDayPlanSlots(prev => [...prev, slot].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    refreshPlannedTaskIds()
    return slot
  }, [currentPlan, refreshPlannedTaskIds, pushHistory])

  const plannerAddBlockedSlot = useCallback(async (title: string, startTime: string, endTime: string) => {
    const db = dbRef.current
    if (!db || !currentPlan) return null
    const did = deviceIdRef.current
    const slot = await addBlockedSlot(db, currentPlan.id, title, startTime, endTime, did)
    setDayPlanSlots(prev => [...prev, slot].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    return slot
  }, [currentPlan])

  const plannerMoveSlot = useCallback(async (slotId: string, startTime: string, endTime: string, currentTasks: any[]) => {
    const db = dbRef.current
    if (!db) return
    pushHistory(currentTasks)
    const did = deviceIdRef.current
    await moveSlot(db, slotId, startTime, endTime, did)
    setDayPlanSlots(prev => prev.map(s => s.id === slotId ? { ...s, startTime, endTime } : s)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)))
  }, [pushHistory])

  const plannerResizeSlot = useCallback(async (slotId: string, endTime: string, currentTasks: any[]) => {
    const db = dbRef.current
    if (!db) return
    pushHistory(currentTasks)
    const did = deviceIdRef.current
    await resizeSlot(db, slotId, endTime, did)
    setDayPlanSlots(prev => prev.map(s => s.id === slotId ? { ...s, endTime } : s))
  }, [pushHistory])

  const plannerRemoveSlot = useCallback(async (slotId: string, currentTasks: any[]) => {
    const db = dbRef.current
    if (!db) return
    pushHistory(currentTasks)
    const did = deviceIdRef.current
    await removeSlot(db, slotId, did)
    setDayPlanSlots(prev => prev.filter(s => s.id !== slotId))
    refreshPlannedTaskIds()
  }, [refreshPlannedTaskIds, pushHistory])

  const plannerUpdateSlotTitle = useCallback(async (slotId: string, title: string) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    await updateSlotTitle(db, slotId, title, did)
    setDayPlanSlots(prev => prev.map(s => s.id === slotId ? { ...s, title } : s))
  }, [])

  const plannerUpdateSlotRecurrence = useCallback(async (slotId: string, recurrence: string | null) => {
    const db = dbRef.current
    if (!db) return
    const did = deviceIdRef.current
    await updateSlotRecurrence(db, slotId, recurrence, did)
    setDayPlanSlots(prev => prev.map(s => s.id === slotId ? { ...s, recurrence } : s))
  }, [])

  const plannerUpdateHours = useCallback(async (dayStartHour: number, dayEndHour: number) => {
    const db = dbRef.current
    if (!db || !currentPlan) return
    const did = deviceIdRef.current
    await updatePlanHours(db, currentPlan.id, dayStartHour, dayEndHour, did)
    setCurrentPlan(prev => ({ ...prev, dayStartHour, dayEndHour }))
  }, [currentPlan])

  return {
    // State
    dayPlanSlots, currentPlan, plannedTaskIds,
    // Setters (exposed for undo/bulkDelete)
    setDayPlanSlots, setPlannedTaskIds,
    // Actions
    refreshPlannedTaskIds,
    plannerLoadDay, plannerRefreshSlots,
    plannerAddTaskSlot, plannerAddBlockedSlot,
    plannerMoveSlot, plannerResizeSlot, plannerRemoveSlot,
    plannerUpdateSlotTitle, plannerUpdateSlotRecurrence, plannerUpdateHours,
  }
}
