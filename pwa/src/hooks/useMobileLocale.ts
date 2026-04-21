/**
 * @file useMobileLocale.ts
 * @description Locale state + translator for MobileApp.
 * Initial locale comes from navigator.language (ru if starts with "ru", else en).
 * t(key) returns the translation string, falling back to en, then to the key itself.
 */
import { useState, useCallback, Dispatch, SetStateAction } from 'react'
import { LOCALES } from '@shared/i18n/locales.js'

export interface MobileLocale {
  locale: string
  setLocale: Dispatch<SetStateAction<string>>
  t: (key: string) => string
}

export function useMobileLocale(): MobileLocale {
  const [locale, setLocale] = useState<string>(() => navigator.language?.startsWith('ru') ? 'ru' : 'en')
  const t = useCallback((key: string) => {
    return (LOCALES[locale] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key
  }, [locale])
  return { locale, setLocale, t }
}
