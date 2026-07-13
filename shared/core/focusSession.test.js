/**
 * Unit tests for core/focusSession.ts — the Focus Bar state machine.
 * All transitions take `now` explicitly, so no fake timers are needed;
 * fixed ISO timestamps keep every assertion deterministic.
 */
import { describe, it, expect } from 'vitest'
import {
  emptyFocusState,
  getActive, getWaiting,
  sessionWorkMs, waitingMs, todayCount,
  focusTask, parkActive, removeSession,
  startPomodoro, pausePomodoro, resumePomodoro, stopPomodoro,
  pomodoroRemainingMs, completePhase,
  restoreOnLaunch,
} from './focusSession.js'
import { localIsoDate } from './date.js'

const T0 = '2026-04-01T10:00:00.000Z'
const at = (min, sec = 0) => new Date(Date.parse(T0) + min * 60_000 + sec * 1000).toISOString()

describe('focusTask / parkActive / removeSession', () => {
  it('creates an active session for a new task', () => {
    const s = focusTask(emptyFocusState(), 'A', T0)
    expect(getActive(s)).toMatchObject({ taskId: 'A', state: 'active', activeSince: T0, accumulatedMs: 0 })
    expect(getWaiting(s)).toEqual([])
  })

  it('demotes the previous active task to waiting and attributes its time', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = focusTask(s, 'B', at(10))
    expect(getActive(s).taskId).toBe('B')
    const a = s.sessions.find(x => x.taskId === 'A')
    expect(a.state).toBe('waiting')
    expect(a.waitingSince).toBe(at(10))
    expect(a.accumulatedMs).toBe(10 * 60_000)
    expect(a.activeSince).toBeNull()
  })

  it('re-activating a waiting task swaps roles and resumes its clock', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = focusTask(s, 'B', at(10))
    s = focusTask(s, 'A', at(25))
    const a = getActive(s)
    expect(a.taskId).toBe('A')
    expect(a.activeSince).toBe(at(25))
    expect(a.waitingSince).toBeNull()
    const b = s.sessions.find(x => x.taskId === 'B')
    expect(b.state).toBe('waiting')
    expect(b.accumulatedMs).toBe(15 * 60_000)
    // total attributed work for A includes both stretches
    expect(sessionWorkMs(a, at(30))).toBe(10 * 60_000 + 5 * 60_000)
  })

  it('focusTask on the already-active task keeps its accumulated time', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = focusTask(s, 'A', at(5))
    const a = getActive(s)
    expect(a.accumulatedMs).toBe(5 * 60_000)
    expect(a.activeSince).toBe(at(5))
    expect(s.sessions).toHaveLength(1)
  })

  it('parkActive moves the active task to waiting without a replacement', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = parkActive(s, at(7))
    expect(getActive(s)).toBeNull()
    const a = s.sessions[0]
    expect(a.state).toBe('waiting')
    expect(a.accumulatedMs).toBe(7 * 60_000)
    expect(waitingMs(a, at(12))).toBe(5 * 60_000)
  })

  it('removeSession drops the entry and keeps the rest intact', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = focusTask(s, 'B', at(10))
    s = removeSession(s, 'A', at(20))
    expect(s.sessions).toHaveLength(1)
    expect(getActive(s).taskId).toBe('B')
    // removing a waiting session must not stop the active clock
    expect(getActive(s).activeSince).not.toBeNull()
  })
})

describe('pomodoro lifecycle', () => {
  it('start → remaining counts down from plannedMin', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    expect(s.pomodoro.phase).toBe('work')
    expect(pomodoroRemainingMs(s.pomodoro, at(10))).toBe(15 * 60_000)
  })

  it('pause freezes the countdown and the task clock; resume extends the end', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = pausePomodoro(s, at(10))
    // frozen at 15:00 remaining regardless of wall clock
    expect(pomodoroRemainingMs(s.pomodoro, at(60))).toBe(15 * 60_000)
    expect(getActive(s).activeSince).toBeNull()
    expect(getActive(s).accumulatedMs).toBe(10 * 60_000)

    s = resumePomodoro(s, at(30))
    expect(s.pomodoro.pausedMs).toBe(20 * 60_000)
    expect(getActive(s).activeSince).toBe(at(30))
    // 10 min worked before pause → 15 remaining after resume
    expect(pomodoroRemainingMs(s.pomodoro, at(30))).toBe(15 * 60_000)
    // paused time is never attributed to the task
    expect(sessionWorkMs(getActive(s), at(35))).toBe(15 * 60_000)
  })

  it('completePhase(work) counts the interval and starts a break with the clock stopped', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = completePhase(s, at(25), 5)
    expect(s.pomodoro.phase).toBe('break')
    expect(s.pomodoro.plannedMin).toBe(5)
    expect(todayCount(s, at(25))).toBe(1)
    expect(getActive(s).activeSince).toBeNull()
    expect(getActive(s).accumulatedMs).toBe(25 * 60_000)

    // break ends → idle, task clock resumes
    s = completePhase(s, at(30), 5)
    expect(s.pomodoro.phase).toBe('idle')
    expect(getActive(s).activeSince).toBe(at(30))
    expect(todayCount(s, at(30))).toBe(1)
  })

  it('completePhase(work) with breakMin=0 goes straight to idle and keeps the clock running', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = completePhase(s, at(25), 0)
    expect(s.pomodoro.phase).toBe('idle')
    expect(getActive(s).activeSince).not.toBeNull()
    expect(todayCount(s, at(25))).toBe(1)
  })

  it('stopPomodoro aborts without counting; switching tasks does not reset the interval', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = focusTask(s, 'B', at(10))            // switch mid-interval
    expect(s.pomodoro.phase).toBe('work')     // interval untouched
    expect(pomodoroRemainingMs(s.pomodoro, at(10))).toBe(15 * 60_000)
    s = stopPomodoro(s, at(12))
    expect(s.pomodoro.phase).toBe('idle')
    expect(todayCount(s, at(12))).toBe(0)
    // attribution split between A and B by actual active stretches
    expect(s.sessions.find(x => x.taskId === 'A').accumulatedMs).toBe(10 * 60_000)
    expect(sessionWorkMs(getActive(s), at(12))).toBe(2 * 60_000)
  })

  it('starting a pomodoro while the active clock is stopped restarts attribution', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = pausePomodoro(s, at(5))
    s = startPomodoro(s, 25, at(20))          // fresh interval instead of resume
    expect(getActive(s).activeSince).toBe(at(20))
    expect(pomodoroRemainingMs(s.pomodoro, at(20))).toBe(25 * 60_000)
  })
})

describe('restoreOnLaunch', () => {
  it('keeps state as-is when the interval is still running (short restart)', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = { ...s, savedAt: at(2) }
    const restored = restoreOnLaunch(s, at(3))
    expect(restored).toBe(s)
  })

  it('caps attribution at savedAt, parks the active task, and resets an expired interval', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = { ...s, savedAt: at(8) }
    const restored = restoreOnLaunch(s, at(120))   // app was closed for ~2h
    expect(restored.pomodoro.phase).toBe('idle')
    const a = restored.sessions[0]
    expect(a.state).toBe('waiting')
    expect(a.accumulatedMs).toBe(8 * 60_000)       // savedAt cap, not 2h
    expect(a.waitingSince).toBe(at(120))
    expect(todayCount(restored, at(120))).toBe(0)  // unattended interval is not counted
  })

  it('handles a persisted idle state without sessions', () => {
    const restored = restoreOnLaunch({ ...emptyFocusState(), savedAt: T0 }, at(60))
    expect(restored.sessions).toEqual([])
    expect(restored.pomodoro.phase).toBe('idle')
  })
})

describe('counters', () => {
  it('accumulates per local date', () => {
    let s = focusTask(emptyFocusState(), 'A', T0)
    s = startPomodoro(s, 25, T0)
    s = completePhase(s, at(25), 0)
    s = startPomodoro(s, 25, at(30))
    s = completePhase(s, at(55), 0)
    const day = localIsoDate(new Date(at(55)))
    expect(s.counts[day]).toBe(2)
  })
})
