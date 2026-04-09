/**
 * Shared constants used by multiple mobile UI components.
 */
import { Inbox, Zap, CheckCircle2, Ban } from 'lucide-react'

export const STATUS_ICONS = { inbox: Inbox, active: Zap, done: CheckCircle2, cancelled: Ban }
export const STATUS_COLORS = {
  inbox: 'text-gray-400', active: 'text-sky-400',
  done: 'text-emerald-400', cancelled: 'text-gray-500',
}
export const OVERDUE_STRIPE_CLS = 'border-l-red-500'
export const NORMAL_STRIPE_CLS = 'border-l-transparent'
export const FULL_CYCLE = ['inbox', 'active', 'done', 'cancelled']
