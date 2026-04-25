/**
 * @file MobileHeader.tsx
 * @description Sticky header: drawer button, app title/logo, search toggle,
 * sync button (when Google Drive is connected), last-sync indicator,
 * and active-task count. Moved out of MobileApp to keep layout render lean.
 */
import { Menu, Search, RefreshCw } from 'lucide-react'

interface Props {
  locale: string
  t: (key: string) => string
  counts: { all: number; active: number }
  searchVisible: boolean
  searchQuery: string
  setSearchVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  onOpenDrawer: () => void
  syncMsg: string | null
  setSyncMsg: (v: string | null) => void
  handleSyncNow: () => Promise<void>
  autoSyncing: boolean
  manualSyncing: boolean
  syncError: string | null
  gdriveConnected: boolean
  syncEnabledOnStore: boolean
  lastSync: string | null
}

export function MobileHeader(p: Props) {
  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-slate-800/90 backdrop-blur-sm sticky top-0 z-30 border-b border-slate-700/30">
      <button onClick={p.onOpenDrawer} className="p-1 -ml-1 text-gray-400 active:text-white">
        <Menu size={22} />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold hidden min-[480px]:block truncate">Task Orchestrator</h1>
        <svg className="w-7 h-7 min-[480px]:hidden" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <rect width="512" height="512" rx="96" fill="#0f172a"/>
          <circle cx="256" cy="256" r="180" fill="none" stroke="#3b82f6" strokeWidth="24" opacity="0.3"/>
          <circle cx="256" cy="256" r="140" fill="none" stroke="#3b82f6" strokeWidth="20"/>
          <polyline points="180,260 232,312 340,204" fill="none" stroke="#60a5fa" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <button onClick={() => p.setSearchVisible(v => !v)}
        className={`p-1.5 rounded-lg ${p.searchVisible || p.searchQuery ? 'text-sky-400' : 'text-gray-400'} active:text-white`}>
        <Search size={18} />
      </button>
      {p.syncMsg && (
        <span className={`text-[10px] mr-1 ${p.syncError ? 'text-red-400' : 'text-emerald-400'}`}>{p.syncMsg}</span>
      )}
      {p.syncEnabledOnStore && p.gdriveConnected && (() => {
        const isSyncing = p.autoSyncing || p.manualSyncing
        const tone = isSyncing
          ? 'text-gray-400'
          : p.syncError
            ? 'text-red-400'
            : 'text-gray-400 active:text-sky-400'
        return (
          <button onClick={async () => {
            p.setSyncMsg(null)
            try { await p.handleSyncNow() } catch { /* already logged in hook */ }
          }} disabled={isSyncing}
            title={p.syncError ? `${p.t('sync.gdriveError')}: ${p.syncError}` : undefined}
            className={`p-1.5 rounded-lg ${tone} ${isSyncing ? 'animate-spin' : ''}`}>
            <RefreshCw size={18} />
          </button>
        )
      })()}
      <div className="text-[10px] text-gray-500 tabular-nums text-right">
        {p.lastSync && (
          <div className="text-emerald-500/70">{p.t('sync.lastSync') || 'Sync'}: {new Date(p.lastSync).toLocaleTimeString(p.locale, { hour: '2-digit', minute: '2-digit' })}</div>
        )}
        <div>{p.counts.active}/{p.counts.all}</div>
      </div>
    </header>
  )
}
