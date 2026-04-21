/**
 * @file useMobileFilters.ts
 * @description Mobile filter state + persistence via localStorage.
 *
 * Exposes filter, dateRange, listFilter, tagFilter, searchQuery, searchVisible,
 * calendarDate and their setters. Each of filter/dateRange/listFilter/tagFilter
 * is persisted to localStorage under a dedicated key; searchQuery/searchVisible
 * and calendarDate are transient.
 *
 * Persistence contract (important — don't re-code the pattern below):
 *   - `null` means "no filter" (e.g. "All" chip, or list/tag filter cleared).
 *   - Stored value "" is interpreted as `null` on load (not as default).
 *   - Missing key (localStorage.getItem returns null) falls back to default.
 * This distinguishes "user actively cleared the filter" from "first visit, no
 * preference saved yet" — critical for filter state to survive remount.
 *
 * Do not inline this logic into MobileApp — the localStorage semantics above
 * already silently regressed once (empty string getting mapped to default on
 * reload, causing the "widened status/date view" to snap back).
 */
import { useState, useCallback, Dispatch, SetStateAction } from 'react'

const KEY_FILTER = 'pwaFilter'
const KEY_DATE_RANGE = 'pwaDateRange'
const KEY_LIST_FILTER = 'pwaListFilter'
const KEY_TAG_FILTER = 'pwaTagFilter'

function readStringOrDefault(key: string, def: string | null): string | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null) return def
    return stored === '' ? null : stored
  } catch {
    return def
  }
}

function writeStringOrNull(key: string, value: string | null): void {
  try { localStorage.setItem(key, value ?? '') } catch { /* best-effort */ }
}

type SetAction<T> = T | ((prev: T) => T)

export interface MobileFilters {
  filter: string | null
  setFilter: (v: SetAction<string | null>) => void
  dateRange: string | null
  setDateRange: (v: SetAction<string | null>) => void
  listFilter: string | null
  setListFilter: (v: SetAction<string | null>) => void
  tagFilter: string | null
  setTagFilter: (v: SetAction<string | null>) => void
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  searchVisible: boolean
  setSearchVisible: Dispatch<SetStateAction<boolean>>
  calendarDate: string | null
  setCalendarDate: Dispatch<SetStateAction<string | null>>
}

export function useMobileFilters(): MobileFilters {
  const [filter, setFilterState] = useState<string | null>(() => readStringOrDefault(KEY_FILTER, 'active'))
  const [dateRange, setDateRangeState] = useState<string | null>(() => readStringOrDefault(KEY_DATE_RANGE, 'today'))
  const [listFilter, setListFilterState] = useState<string | null>(() => readStringOrDefault(KEY_LIST_FILTER, null))
  const [tagFilter, setTagFilterState] = useState<string | null>(() => readStringOrDefault(KEY_TAG_FILTER, null))
  const [searchQuery, setSearchQuery] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const [calendarDate, setCalendarDate] = useState<string | null>(null)

  const setFilter = useCallback((v: SetAction<string | null>) => {
    setFilterState(prev => {
      const next = typeof v === 'function' ? (v as (p: string | null) => string | null)(prev) : v
      writeStringOrNull(KEY_FILTER, next)
      return next
    })
  }, [])

  const setDateRange = useCallback((v: SetAction<string | null>) => {
    setDateRangeState(prev => {
      const next = typeof v === 'function' ? (v as (p: string | null) => string | null)(prev) : v
      writeStringOrNull(KEY_DATE_RANGE, next)
      return next
    })
  }, [])

  const setListFilter = useCallback((v: SetAction<string | null>) => {
    setListFilterState(prev => {
      const next = typeof v === 'function' ? (v as (p: string | null) => string | null)(prev) : v
      writeStringOrNull(KEY_LIST_FILTER, next)
      return next
    })
  }, [])

  const setTagFilter = useCallback((v: SetAction<string | null>) => {
    setTagFilterState(prev => {
      const next = typeof v === 'function' ? (v as (p: string | null) => string | null)(prev) : v
      writeStringOrNull(KEY_TAG_FILTER, next)
      return next
    })
  }, [])

  return {
    filter, setFilter,
    dateRange, setDateRange,
    listFilter, setListFilter,
    tagFilter, setTagFilter,
    searchQuery, setSearchQuery,
    searchVisible, setSearchVisible,
    calendarDate, setCalendarDate,
  }
}
