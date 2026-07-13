/**
 * Focus session state machine — pure, storage-agnostic logic for the
 * desktop Focus Bar (docked AppBar window).
 *
 * Model:
 * - `sessions` is the set of tasks currently "in focus". At most ONE is
 *   'active' (attention is single-threaded); the rest are 'waiting'
 *   (e.g. a build/agent runs on the machine while the user works on
 *   something else).
 * - The pomodoro timer is bound to *attention*, not to a task: switching
 *   the active task does not reset the running interval. Per-task time
 *   attribution is separate: a task accumulates only its own 'active'
 *   stretches (`accumulatedMs`); waiting time is displayed but never
 *   counted as work.
 * - Everything is wall-clock derived: no ticking state. Callers pass `now`
 *   (ISO string) into every transition, so the logic is deterministic and
 *   survives app restarts (see restoreOnLaunch).
 */

import { localIsoDate } from './date.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FocusSessionEntry {
  taskId: string
  state: 'active' | 'waiting'
  /** Attributed active work, ms. Waiting time is NOT included. */
  accumulatedMs: number
  /** Set while the attribution clock is running (active + not paused). */
  activeSince: string | null
  /** Set while state === 'waiting'. */
  waitingSince: string | null
}

export interface PomodoroState {
  phase: 'idle' | 'work' | 'break'
  /** Start of the current phase (work or break). */
  startedAt: string | null
  /** Planned length of the current phase, minutes. */
  plannedMin: number
  /** Set while paused; freezes the countdown. */
  pausedAt: string | null
  /** Total paused time inside the current phase, ms. */
  pausedMs: number
}

export interface FocusState {
  sessions: FocusSessionEntry[]
  pomodoro: PomodoroState
  /** Completed work intervals per local date (YYYY-MM-DD → count). */
  counts: Record<string, number>
  /** Stamped by the persistence layer on save; used by restoreOnLaunch. */
  savedAt?: string
}

// ─── Constructors / selectors ───────────────────────────────────────────────

export function emptyFocusState(): FocusState {
  return {
    sessions: [],
    pomodoro: { phase: 'idle', startedAt: null, plannedMin: 0, pausedAt: null, pausedMs: 0 },
    counts: {},
  }
}

export function getActive(state: FocusState): FocusSessionEntry | null {
  return state.sessions.find(s => s.state === 'active') ?? null
}

export function getWaiting(state: FocusState): FocusSessionEntry[] {
  return state.sessions.filter(s => s.state === 'waiting')
}

/** Attributed work time of a session as of `now` (includes the running stretch). */
export function sessionWorkMs(entry: FocusSessionEntry, now: string): number {
  const running = entry.activeSince ? Math.max(0, Date.parse(now) - Date.parse(entry.activeSince)) : 0
  return entry.accumulatedMs + running
}

/** How long a waiting session has been waiting, ms (0 for non-waiting). */
export function waitingMs(entry: FocusSessionEntry, now: string): number {
  if (entry.state !== 'waiting' || !entry.waitingSince) return 0
  return Math.max(0, Date.parse(now) - Date.parse(entry.waitingSince))
}

export function todayCount(state: FocusState, now: string): number {
  return state.counts[localIsoDate(new Date(now))] ?? 0
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Flush the active session's running stretch into accumulatedMs and stop its clock. */
function flushActive(sessions: FocusSessionEntry[], upToMs: number): FocusSessionEntry[] {
  return sessions.map(s => {
    if (s.state !== 'active' || !s.activeSince) return s
    const delta = Math.max(0, upToMs - Date.parse(s.activeSince))
    return { ...s, accumulatedMs: s.accumulatedMs + delta, activeSince: null }
  })
}

function clockPaused(p: PomodoroState): boolean {
  return p.phase === 'break' || (p.phase === 'work' && p.pausedAt !== null)
}

// ─── Session transitions ────────────────────────────────────────────────────

/**
 * Bring a task into focus as the active one. The previous active session
 * (if any, and different) becomes 'waiting'. Creates the session if absent.
 */
export function focusTask(state: FocusState, taskId: string, now: string): FocusState {
  const id = String(taskId)
  const nowMs = Date.parse(now)
  let sessions = flushActive(state.sessions, nowMs).map(s =>
    s.state === 'active' && s.taskId !== id
      ? { ...s, state: 'waiting' as const, waitingSince: now }
      : s
  )
  const clockRuns = !clockPaused(state.pomodoro)
  const existing = sessions.find(s => s.taskId === id)
  if (existing) {
    sessions = sessions.map(s => s.taskId === id
      ? { ...s, state: 'active' as const, waitingSince: null, activeSince: clockRuns ? now : null }
      : s)
  } else {
    sessions = [...sessions, {
      taskId: id, state: 'active', accumulatedMs: 0,
      activeSince: clockRuns ? now : null, waitingSince: null,
    }]
  }
  return { ...state, sessions }
}

/** Park the active session into 'waiting' (nothing becomes active). */
export function parkActive(state: FocusState, now: string): FocusState {
  const nowMs = Date.parse(now)
  const sessions = flushActive(state.sessions, nowMs).map(s =>
    s.state === 'active' ? { ...s, state: 'waiting' as const, waitingSince: now } : s
  )
  return { ...state, sessions }
}

/** Drop a session entirely (task completed or dismissed from the bar). */
export function removeSession(state: FocusState, taskId: string, now: string): FocusState {
  const id = String(taskId)
  const nowMs = Date.parse(now)
  const sessions = flushActive(state.sessions, nowMs)
    .filter(s => s.taskId !== id)
    // flushActive stopped the survivor's clock only if it was active; restart
    // clocks for sessions that stay active (i.e. we removed a waiting one).
    .map(s => s.state === 'active' && !s.activeSince && !clockPaused(state.pomodoro)
      ? { ...s, activeSince: now }
      : s)
  return { ...state, sessions }
}

// ─── Pomodoro transitions ───────────────────────────────────────────────────

/** Start a work interval of `minutes`. Resumes the active session's clock. */
export function startPomodoro(state: FocusState, minutes: number, now: string): FocusState {
  const sessions = state.sessions.map(s =>
    s.state === 'active' && !s.activeSince ? { ...s, activeSince: now } : s
  )
  return {
    ...state, sessions,
    pomodoro: { phase: 'work', startedAt: now, plannedMin: minutes, pausedAt: null, pausedMs: 0 },
  }
}

/** Pause the countdown; task attribution pauses with it. */
export function pausePomodoro(state: FocusState, now: string): FocusState {
  if (state.pomodoro.phase === 'idle' || state.pomodoro.pausedAt) return state
  return {
    ...state,
    sessions: flushActive(state.sessions, Date.parse(now)),
    pomodoro: { ...state.pomodoro, pausedAt: now },
  }
}

export function resumePomodoro(state: FocusState, now: string): FocusState {
  const p = state.pomodoro
  if (p.phase === 'idle' || !p.pausedAt) return state
  const sessions = state.sessions.map(s =>
    s.state === 'active' ? { ...s, activeSince: now } : s
  )
  return {
    ...state, sessions,
    pomodoro: { ...p, pausedMs: p.pausedMs + Math.max(0, Date.parse(now) - Date.parse(p.pausedAt)), pausedAt: null },
  }
}

/** Abort the current interval without counting it. Attribution keeps running. */
export function stopPomodoro(state: FocusState, now: string): FocusState {
  const sessions = state.sessions.map(s =>
    s.state === 'active' && !s.activeSince ? { ...s, activeSince: now } : s
  )
  return {
    ...state, sessions,
    pomodoro: { phase: 'idle', startedAt: null, plannedMin: 0, pausedAt: null, pausedMs: 0 },
  }
}

/** Countdown remaining, ms. 0 when idle or elapsed. Frozen while paused. */
export function pomodoroRemainingMs(p: PomodoroState, now: string): number {
  if (p.phase === 'idle' || !p.startedAt) return 0
  const endMs = Date.parse(p.startedAt) + p.plannedMin * 60_000 + p.pausedMs
  const effNow = p.pausedAt ? Date.parse(p.pausedAt) : Date.parse(now)
  return Math.max(0, endMs - effNow)
}

/**
 * Advance an elapsed phase. work → break (counts the interval; task clock
 * stops for the break) or → idle when breakMin is 0. break → idle (task
 * clock resumes — the user is assumed back at work).
 */
export function completePhase(state: FocusState, now: string, breakMin: number): FocusState {
  const p = state.pomodoro
  if (p.phase === 'idle') return state
  if (p.phase === 'work') {
    const day = localIsoDate(new Date(now))
    const counts = { ...state.counts, [day]: (state.counts[day] ?? 0) + 1 }
    if (breakMin > 0) {
      return {
        ...state, counts,
        sessions: flushActive(state.sessions, Date.parse(now)),
        pomodoro: { phase: 'break', startedAt: now, plannedMin: breakMin, pausedAt: null, pausedMs: 0 },
      }
    }
    return {
      ...state, counts,
      pomodoro: { phase: 'idle', startedAt: null, plannedMin: 0, pausedAt: null, pausedMs: 0 },
    }
  }
  // break ended
  const sessions = state.sessions.map(s =>
    s.state === 'active' && !s.activeSince ? { ...s, activeSince: now } : s
  )
  return {
    ...state, sessions,
    pomodoro: { phase: 'idle', startedAt: null, plannedMin: 0, pausedAt: null, pausedMs: 0 },
  }
}

// ─── Restart recovery ───────────────────────────────────────────────────────

/**
 * Reconcile persisted state after an app launch. If the interval is still
 * running (short restart) the state is kept as-is. Otherwise attribution is
 * capped at `savedAt` (we can't know what happened while the app was closed),
 * the active session is parked, and the pomodoro resets to idle — nothing is
 * counted for intervals that "finished" unattended.
 */
export function restoreOnLaunch(state: FocusState, now: string): FocusState {
  const alive = state.pomodoro.phase !== 'idle' && pomodoroRemainingMs(state.pomodoro, now) > 0
  if (alive) return state
  const capMs = Math.min(state.savedAt ? Date.parse(state.savedAt) : Date.parse(now), Date.parse(now))
  const sessions = flushActive(state.sessions, capMs).map(s =>
    s.state === 'active' ? { ...s, state: 'waiting' as const, waitingSince: now } : s
  )
  return {
    ...state, sessions,
    pomodoro: { phase: 'idle', startedAt: null, plannedMin: 0, pausedAt: null, pausedMs: 0 },
  }
}
