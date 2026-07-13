/**
 * @file useFocusController.ts
 * Main-window side of the Focus Bar. Owns the focus session state
 * (shared/core/focusSession.ts), persists it into the SQLite meta table,
 * manages the `focusbar` window lifecycle (create → AppBar dock → show),
 * and bridges the two windows over Tauri events:
 *
 *   main ──(focus:state)──▶ focusbar     full snapshot after every change
 *   focusbar ──(focus:cmd)──▶ main       user actions; ALL writes happen here
 *
 * The bar window never touches the database — completing a task from the
 * bar goes through store.bulkStatus with the recurrence spawn logic intact.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow, currentMonitor, type Monitor } from '@tauri-apps/api/window'
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { listen, emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import {
  emptyFocusState, focusTask, parkActive, removeSession,
  startPomodoro, pausePomodoro, resumePomodoro, stopPomodoro,
  completePhase, pomodoroRemainingMs, restoreOnLaunch,
  type FocusState,
} from '../core/focusSession.js'
import { getFocusBarConfig, isTauriRuntime, type FocusBarConfig } from '../core/focusConfig.js'
import { timeToMinutes } from '../store/dayPlanner.js'
import { localIsoDate } from '../core/date.js'

const FOCUS_META_KEY = 'focus_state_v1'
const BAR_LABEL = 'focusbar'

interface ControllerParams {
  store: any
  tasks: any[]
  settings: any
  updateSetting: (key: string, val: unknown) => void
  locale: string
  t: (key: string, params?: Record<string, string | number>) => string
  addToast: (msg: string) => void
  setEditTaskId: (id: string | null) => void
}

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Current and next task-slots of today's plan, with task titles resolved. */
function computeSlotInfo(slots: any[], tasks: any[]) {
  const nm = nowMinutes()
  const taskSlots = (slots || []).filter(s => s.slotType === 'task')
  const titleOf = (s: any) => {
    if (s.taskId) return tasks.find(tk => String(tk.id) === String(s.taskId))?.title ?? s.title ?? ''
    return s.title ?? ''
  }
  const cur = taskSlots.find(s => timeToMinutes(s.startTime) <= nm && nm < timeToMinutes(s.endTime)) ?? null
  const next = taskSlots
    .filter(s => timeToMinutes(s.startTime) > nm)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null
  return {
    currentSlot: cur ? { endTime: cur.endTime, taskId: cur.taskId ? String(cur.taskId) : null, title: titleOf(cur) } : null,
    nextSlot: next ? { startTime: next.startTime, taskId: next.taskId ? String(next.taskId) : null, title: titleOf(next) } : null,
  }
}

/** Bar geometry in physical pixels for the monitor the main window is on. */
async function barGeometry(size: FocusBarConfig['size']) {
  let mon: Monitor | null = null
  try { mon = await currentMonitor() } catch { /* headless */ }
  const scale = mon?.scaleFactor || 1
  const physW = mon?.size.width ?? 1920
  const physScreenH = mon?.size.height ?? 1080
  // 'auto' ≈ 1/33 of the screen (half strip + 20%), clamped; 'compact' = one thin row.
  const physH = size === 'compact'
    ? Math.round(26 * scale)
    : Math.max(Math.round(26 * scale), Math.min(Math.round(52 * scale), Math.round(physScreenH / 33)))
  return { scale, physW, physH, x: mon?.position?.x ?? 0, y: mon?.position?.y ?? 0 }
}

export function useFocusController({ store, tasks, settings, updateSetting, locale, t, addToast, setEditTaskId }: ControllerParams) {
  const cfg = getFocusBarConfig(settings)
  const [fs, setFs] = useState<FocusState>(emptyFocusState)
  const [slots, setSlots] = useState<any[]>([])
  const restoredRef = useRef(false)

  // Refs so the singleton event listener always sees fresh values.
  const fsRef = useRef(fs); fsRef.current = fs
  const cfgRef = useRef(cfg); cfgRef.current = cfg
  const tasksRef = useRef(tasks); tasksRef.current = tasks
  const slotsRef = useRef(slots); slotsRef.current = slots
  const storeRef = useRef(store); storeRef.current = store
  const localeRef = useRef(locale); localeRef.current = locale
  const tRef = useRef(t); tRef.current = t
  const addToastRef = useRef(addToast); addToastRef.current = addToast
  const updateSettingRef = useRef(updateSetting); updateSettingRef.current = updateSetting
  const setEditTaskIdRef = useRef(setEditTaskId); setEditTaskIdRef.current = setEditTaskId

  // ── Persistence: restore once meta is loaded, save (debounced) on change ──
  useEffect(() => {
    if (restoredRef.current || store.metaSettings == null) return
    restoredRef.current = true
    try {
      const raw = store.metaSettings[FOCUS_META_KEY]
      if (raw) setFs(restoreOnLaunch(JSON.parse(raw), new Date().toISOString()))
    } catch { /* corrupt state — start empty */ }
  }, [store.metaSettings])

  useEffect(() => {
    if (!restoredRef.current) return
    const timer = setTimeout(() => {
      storeRef.current.saveMeta?.(FOCUS_META_KEY, JSON.stringify({ ...fsRef.current, savedAt: new Date().toISOString() }))
    }, 800)
    return () => clearTimeout(timer)
  }, [fs])

  // ── Window lifecycle ───────────────────────────────────────────────────────
  const dockAndShow = useCallback(async () => {
    const w = await WebviewWindow.getByLabel(BAR_LABEL)
    if (!w) return
    const geo = await barGeometry(cfgRef.current.size)
    if (cfgRef.current.mode === 'appbar') {
      try {
        await invoke('appbar_dock', { label: BAR_LABEL, height: geo.physH })
      } catch (e) {
        // Non-Windows or shell refusal — degrade to a plain overlay strip.
        console.warn('[focusbar] appbar dock failed, using overlay:', e)
        addToastRef.current?.(`Focus bar: dock failed (${String(e)}), using overlay`)
        await w.setPosition(new PhysicalPosition(geo.x, geo.y)).catch(() => {})
        await w.setSize(new PhysicalSize(geo.physW, geo.physH)).catch(() => {})
      }
    } else {
      await invoke('appbar_undock', { label: BAR_LABEL }).catch(() => {})
      await w.setPosition(new PhysicalPosition(geo.x, geo.y)).catch(() => {})
      await w.setSize(new PhysicalSize(geo.physW, geo.physH)).catch(() => {})
      await w.setAlwaysOnTop(true).catch(() => {})
    }
    await w.show().catch(() => {})
  }, [])

  const openBar = useCallback(async () => {
    console.log('[focusbar] openBar: checking for existing window…')
    const existing = await WebviewWindow.getByLabel(BAR_LABEL)
    if (existing) { console.log('[focusbar] window exists, re-docking'); await dockAndShow(); return }
    const geo = await barGeometry(cfgRef.current.size)
    console.log('[focusbar] creating window', geo)
    // Created hidden; docking + show happen when the bar reports 'ready'.
    try {
      const w = new WebviewWindow(BAR_LABEL, {
        url: 'index.html#focusbar',
        x: 0, y: 0,
        width: Math.round(geo.physW / geo.scale),
        height: Math.round(geo.physH / geo.scale),
        decorations: false, resizable: false, maximizable: false, minimizable: false,
        alwaysOnTop: true, skipTaskbar: true, shadow: false, focus: false, visible: false,
        title: 'Focus',
      })
      w.once('tauri://error', (e) => {
        console.error('[focusbar] window creation failed:', e)
        addToastRef.current?.(`Focus bar: window creation failed — ${JSON.stringify(e.payload ?? e)}`)
      })
      w.once('tauri://created', () => { console.log('[focusbar] window created') })
    } catch (e) {
      addToastRef.current?.(`Focus bar: ${String(e)}`)
      return
    }
    // Safety net: if the 'ready' handshake never arrives (e.g. the bar page
    // failed to wire events), dock and show the window anyway.
    setTimeout(() => { dockAndShow() }, 2500)
  }, [dockAndShow])

  const closeBar = useCallback(async () => {
    const w = await WebviewWindow.getByLabel(BAR_LABEL)
    if (!w) return
    await invoke('appbar_undock', { label: BAR_LABEL }).catch(() => {})
    await w.close().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    if (cfg.enabled) openBar(); else closeBar()
  }, [cfg.enabled, openBar, closeBar])

  // Re-negotiate on mode/size change while visible.
  useEffect(() => {
    if (!isTauriRuntime() || !cfgRef.current.enabled) return
    dockAndShow()
  }, [cfg.mode, cfg.size, dockAndShow])

  // ── State broadcast to the bar ─────────────────────────────────────────────
  const emitState = useCallback(() => {
    if (!isTauriRuntime() || !cfgRef.current.enabled) return
    const titles: Record<string, string> = {}
    for (const s of fsRef.current.sessions) {
      titles[s.taskId] = tasksRef.current.find(tk => String(tk.id) === s.taskId)?.title ?? '…'
    }
    const { currentSlot, nextSlot } = computeSlotInfo(slotsRef.current, tasksRef.current)
    emit('focus:state', {
      cfg: cfgRef.current, locale: localeRef.current, state: fsRef.current, titles, currentSlot, nextSlot,
    }).catch(() => {})
  }, [])

  useEffect(() => { emitState() }, [fs, tasks, slots, settings, locale, emitState])

  // ── Today's schedule slots (read-only, for the "until slot end" preset) ────
  useEffect(() => {
    if (!isTauriRuntime() || !cfg.enabled) return
    let cancelled = false
    const load = async () => {
      const s = await storeRef.current.plannerGetSlotsByDate?.(localIsoDate(new Date())).catch(() => [])
      if (!cancelled && s) setSlots(s)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [cfg.enabled, store.dayPlanSlots])

  // ── Phase completion ticker (only while the countdown is running) ─────────
  useEffect(() => {
    const p = fs.pomodoro
    if (p.phase === 'idle' || p.pausedAt) return
    const iv = setInterval(() => {
      const now = new Date().toISOString()
      if (pomodoroRemainingMs(fsRef.current.pomodoro, now) > 0) return
      const wasWork = fsRef.current.pomodoro.phase === 'work'
      setFs(s => completePhase(s, now, cfgRef.current.pomodoro.breakMin))
      addToastRef.current?.(tRef.current(wasWork ? 'focus.workDone' : 'focus.breakDone'))
    }, 1000)
    return () => clearInterval(iv)
  }, [fs.pomodoro.phase, fs.pomodoro.pausedAt, fs.pomodoro.startedAt, fs.pomodoro.pausedMs])

  // ── Drop sessions whose task got completed/cancelled/deleted elsewhere ────
  useEffect(() => {
    if (fsRef.current.sessions.length === 0) return
    const now = new Date().toISOString()
    const gone = fsRef.current.sessions.filter(s => {
      const task = tasks.find(tk => String(tk.id) === s.taskId)
      return !task || task.status === 'done' || task.status === 'cancelled'
    })
    if (gone.length > 0) {
      setFs(st => gone.reduce((acc, s) => removeSession(acc, s.taskId, now), st))
    }
  }, [tasks])

  // ── Command channel from the bar ───────────────────────────────────────────
  useEffect(() => {
    if (!isTauriRuntime()) return
    const un = listen<any>('focus:cmd', async (e) => {
      const cmd = e.payload || {}
      const now = new Date().toISOString()
      switch (cmd.type) {
        case 'ready':
          await dockAndShow()
          emitState()
          break
        case 'activate':
          setFs(s => focusTask(s, String(cmd.taskId), now))
          break
        case 'park':
          setFs(s => parkActive(s, now))
          break
        case 'remove':
          setFs(s => removeSession(s, String(cmd.taskId), now))
          break
        case 'done': {
          const id = String(cmd.taskId)
          setFs(s => removeSession(s, id, now))
          await storeRef.current.bulkStatus(new Set([id]), 'done', tasksRef.current)
          addToastRef.current?.(tRef.current('focus.doneToast'))
          break
        }
        case 'open-task':
          setEditTaskIdRef.current?.(String(cmd.taskId))
          // fallthrough to raising the main window
        case 'open-main': {
          const main = getCurrentWindow()
          await main.unminimize().catch(() => {})
          await main.setFocus().catch(() => {})
          break
        }
        case 'pomodoro-start': {
          let minutes: number
          if (cmd.preset === 'slot') {
            const { currentSlot } = computeSlotInfo(slotsRef.current, tasksRef.current)
            if (!currentSlot?.endTime) break
            minutes = Math.max(1, timeToMinutes(currentSlot.endTime) - nowMinutes())
          } else {
            minutes = Math.round(Number(cmd.minutes))
            if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) break
          }
          setFs(s => startPomodoro(s, minutes, now))
          break
        }
        case 'pomodoro-pause': setFs(s => pausePomodoro(s, now)); break
        case 'pomodoro-resume': setFs(s => resumePomodoro(s, now)); break
        case 'pomodoro-stop': setFs(s => stopPomodoro(s, now)); break
        case 'hide':
          updateSettingRef.current?.('focusBar', { ...cfgRef.current, enabled: false })
          break
      }
    })
    return () => { un.then(f => f()) }
  }, [dockAndShow, emitState])

  // ── Public API for the main window UI ──────────────────────────────────────

  /** Context-menu / row action: bring a task into focus (opens the bar if hidden). */
  const focusTaskById = useCallback((taskId: string) => {
    const now = new Date().toISOString()
    setFs(s => focusTask(s, String(taskId), now))
    if (!cfgRef.current.enabled) {
      updateSettingRef.current?.('focusBar', { ...cfgRef.current, enabled: true })
    }
  }, [])

  const toggleBar = useCallback(() => {
    updateSettingRef.current?.('focusBar', { ...cfgRef.current, enabled: !cfgRef.current.enabled })
  }, [])

  return { focusTaskById, toggleBar, barEnabled: cfg.enabled }
}
