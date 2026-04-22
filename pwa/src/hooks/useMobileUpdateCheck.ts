/**
 * @file useMobileUpdateCheck.ts
 * @description "Updated to vX.Y.Z" toast right after a service-worker-driven reload.
 *
 * The update flow writes the previous version into sessionStorage('pwa_update_check')
 * before reloading. On mount, we read that key once and derive a toast message:
 *   - key missing → no toast (null).
 *   - key equals current version → "No updates available" (user hit "Check for updates"
 *     but was already on latest).
 *   - key differs → "Updated to v<current>" (success).
 * The toast auto-dismisses after 5 seconds via the internal effect. Caller can also
 * close it manually via setUpdateMsg(null).
 */
import { useState, useEffect, Dispatch, SetStateAction } from 'react'

export interface UpdateMsg {
  text: string
  ok: boolean
}

declare const __APP_VERSION__: string

export function useMobileUpdateCheck(locale: string): [UpdateMsg | null, Dispatch<SetStateAction<UpdateMsg | null>>] {
  const [updateMsg, setUpdateMsg] = useState<UpdateMsg | null>(() => {
    try {
      const prev = sessionStorage.getItem('pwa_update_check')
      if (!prev) return null
      sessionStorage.removeItem('pwa_update_check')
      const currentVer = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
      if (prev === currentVer) return { text: locale === 'ru' ? 'Обновлений не найдено' : 'No updates available', ok: false }
      return { text: (locale === 'ru' ? 'Обновлено до v' : 'Updated to v') + currentVer, ok: true }
    } catch { return null }
  })
  useEffect(() => {
    if (!updateMsg) return
    const timer = setTimeout(() => setUpdateMsg(null), 5000)
    return () => clearTimeout(timer)
  }, [updateMsg])
  return [updateMsg, setUpdateMsg]
}
