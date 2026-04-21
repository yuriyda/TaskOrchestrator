/**
 * @file useMobileUndo.ts
 * @description Toast-undo state for MobileApp.
 *
 * showUndo(label, undoFn) displays a bottom toast for 5 seconds. Pass `null` as
 * undoFn when the operation has fan-out side effects (completion, cycle→done)
 * that a simple callback cannot roll back — the toast still shows label but
 * omits the Undo button. See pwa-architecture-plan-2026-04-21.md Task 2 and
 * requirements.md 13.5 for the scope contract.
 *
 * clearUndo() is exposed so the UI's Undo button can dismiss the toast after
 * invoking the callback; the internal timeout clears it after 5s anyway.
 */
import { useState, useCallback, useRef, useEffect } from 'react'

export interface UndoAction {
  label: string
  undo: (() => void) | null
}

export interface MobileUndo {
  undoAction: UndoAction | null
  showUndo: (label: string, undoFn: (() => void) | null) => void
  clearUndo: () => void
}

const TOAST_DURATION_MS = 5000

export function useMobileUndo(): MobileUndo {
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const undoTimerRef = useRef<any>(null)

  const showUndo = useCallback((label: string, undoFn: (() => void) | null) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoAction({ label, undo: undoFn || null })
    undoTimerRef.current = setTimeout(() => setUndoAction(null), TOAST_DURATION_MS)
  }, [])

  const clearUndo = useCallback(() => {
    setUndoAction(null)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
  }, [])

  // Cancel the 5s timer on unmount so it doesn't fire setUndoAction on a dead hook.
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
  }, [])

  return { undoAction, showUndo, clearUndo }
}
