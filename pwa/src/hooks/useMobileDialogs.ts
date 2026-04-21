/**
 * @file useMobileDialogs.ts
 * @description Transient dialog/overlay state for MobileApp.
 *
 * drawerOpen, showAdd, detailId, showCalendar, showSettings — all boolean-ish
 * toggles driving full-screen modals or slide-in panels. Not persisted.
 * Lives in its own hook so MobileApp's top-level body stays focused on data.
 */
import { useState, Dispatch, SetStateAction } from 'react'

export interface MobileDialogs {
  drawerOpen: boolean
  setDrawerOpen: Dispatch<SetStateAction<boolean>>
  showAdd: boolean
  setShowAdd: Dispatch<SetStateAction<boolean>>
  detailId: string | null
  setDetailId: Dispatch<SetStateAction<string | null>>
  showCalendar: boolean
  setShowCalendar: Dispatch<SetStateAction<boolean>>
  showSettings: boolean
  setShowSettings: Dispatch<SetStateAction<boolean>>
}

export function useMobileDialogs(): MobileDialogs {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  return {
    drawerOpen, setDrawerOpen,
    showAdd, setShowAdd,
    detailId, setDetailId,
    showCalendar, setShowCalendar,
    showSettings, setShowSettings,
  }
}
