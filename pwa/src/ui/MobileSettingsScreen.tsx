/**
 * @file MobileSettingsScreen.tsx
 * @description Full-screen settings panel for PWA mobile UI.
 * Extracted from MobileApp.tsx to keep the main orchestrator focused on layout.
 * Props are deliberately explicit — there's no app-wide settings context in PWA.
 */
import { useState, useEffect } from 'react'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { getPerfStats, getPerfGauges } from '@shared/core/perfMeter'

declare const __APP_VERSION__: string

interface Props {
  locale: string
  setLocale: (l: string) => void
  store: any
  gdriveConnected: boolean
  autoSyncEnabled: boolean
  autoSyncOnFocusEnabled: boolean
  updateMsg: { text: string; ok: boolean } | null
  onClose: () => void
}

function MobileDiagnostics({ L }: { L: (ru: string, en: string) => string }) {
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(id) }, [])
  const stats = getPerfStats()
  const gauges = getPerfGauges()
  const labels = Object.keys(stats).sort()
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {L('Диагностика', 'Diagnostics')}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        {L('Тайминги fetchAll за сессию и число задач.', 'Per-session fetchAll timings and task count.')}
      </div>
      {labels.length === 0 ? (
        <div className="text-xs text-gray-600 italic">
          {L('Замеров пока нет.', 'No measurements yet.')}
        </div>
      ) : (
        <div className="space-y-1">
          {labels.map(label => {
            const s = stats[label]
            const avg = s.count > 0 ? s.totalMs / s.count : 0
            return (
              <div key={label} className="grid grid-cols-5 gap-1 text-[10px] font-mono text-gray-400">
                <div className="col-span-2 truncate">{label}</div>
                <div>n={s.count}</div>
                <div>avg {avg.toFixed(1)}ms</div>
                <div>max {s.maxMs.toFixed(1)}ms</div>
              </div>
            )
          })}
          {Object.keys(gauges).length > 0 && (
            <div className="text-[10px] font-mono text-gray-500 pt-1 border-t border-slate-700 mt-1">
              {Object.entries(gauges).map(([k, v]) => `${k}=${v}`).join('  ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MobileSettingsScreen({ locale, setLocale, store, gdriveConnected, autoSyncEnabled, autoSyncOnFocusEnabled, updateMsg, onClose }: Props) {
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)

  const L = (ru: string, en: string) => locale === 'ru' ? ru : en

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" data-testid="mobile-settings">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700/50">
        <button onClick={onClose} className="p-1 -ml-1 text-gray-400 active:text-white">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-base font-semibold">{L('Настройки', 'Settings')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Language */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">{L('Язык', 'Language')}</div>
          <div className="flex gap-2">
            {['en', 'ru'].map(l => (
              <button key={l} onClick={() => setLocale(l)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${locale === l ? 'bg-sky-600 text-white' : 'bg-slate-800 text-gray-400 active:bg-slate-700'}`}>
                {l === 'en' ? 'English' : 'Русский'}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-sync toggles */}
        {gdriveConnected && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">{L('Синхронизация', 'Sync')}</div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-gray-200">{L('Автосинхронизация', 'Auto-sync')}</div>
                <div className="text-xs text-gray-500">{L('После каждого изменения (3 сек)', 'After every change (3 sec)')}</div>
              </div>
              <button
                onClick={() => store.saveMeta('pwa_auto_sync', autoSyncEnabled ? 'false' : 'true')}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoSyncEnabled ? 'bg-sky-600' : 'bg-gray-600'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoSyncEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">{L('Синхронизация при возвращении', 'Sync on return')}</div>
                <div className="text-xs text-gray-500">{L('При возвращении в приложение (не чаще 1 раза в 5 мин)', 'When the app regains focus (max once per 5 min)')}</div>
              </div>
              <button
                onClick={() => store.saveMeta('auto_sync_on_focus', autoSyncOnFocusEnabled ? 'false' : 'true')}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoSyncOnFocusEnabled ? 'bg-sky-600' : 'bg-gray-600'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoSyncOnFocusEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Auto-extract URL toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">{L('Извлекать URL', 'Auto-extract URL')}</div>
            <div className="text-xs text-gray-500">{L('Переносить ссылку из названия в поле URL', 'Move links from title to URL field')}</div>
          </div>
          <button
            onClick={() => store.saveMeta('pwa_auto_extract_url', store.metaSettings?.pwa_auto_extract_url === 'false' ? 'true' : 'false')}
            className={`relative w-11 h-6 rounded-full transition-colors ${store.metaSettings?.pwa_auto_extract_url !== 'false' ? 'bg-sky-600' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${store.metaSettings?.pwa_auto_extract_url !== 'false' ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Cleanup unused lookups */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
            {L('Обслуживание', 'Maintenance')}
          </div>
          <div className="text-sm text-gray-200 mb-1">
            {L('Очистить неиспользуемые списки, теги, персонажи, потоки', 'Clean up unused lists, tags, personas, flows')}
          </div>
          <div className="text-xs text-gray-500 mb-3">
            {L('Удаляет записи, на которые больше не ссылается ни одна задача. Потоки с сохранёнными описанием/цветом/дедлайном остаются.',
               'Removes entries no longer referenced by any task. Flows with saved description/color/deadline are kept.')}
          </div>
          <button
            disabled={cleaning}
            onClick={async () => {
              setCleaning(true)
              setCleanupMsg(null)
              try {
                const { removed } = await store.cleanupLookups()
                const count = removed.lists.length + removed.tags.length + removed.personas.length + removed.flows.length
                setCleanupMsg(count === 0
                  ? L('Очищать нечего', 'Nothing to clean up')
                  : L(`Удалено ненужных записей: ${count}`, `Removed ${count} unused entries`))
              } finally {
                setCleaning(false)
              }
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${cleaning ? 'bg-slate-700 text-gray-500' : 'bg-slate-800 text-gray-200 active:bg-slate-700'}`}>
            {cleaning ? L('Чистим…', 'Cleaning…') : L('Очистить', 'Clean up')}
          </button>
          {cleanupMsg && <div className="text-xs text-gray-400 mt-2">{cleanupMsg}</div>}
        </div>

        {/* Clear local storage */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-3">{L('Опасная зона', 'Danger zone')}</div>
          <p className="text-xs text-gray-500 mb-3">
            {L('Удалит все задачи и справочники из локального хранилища. Настройки синхронизации сохранятся.',
               'Deletes all tasks and lookups from local storage. Sync settings are preserved.')}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={clearConfirmText}
              onChange={e => setClearConfirmText(e.target.value)}
              placeholder={L('Введите DELETE', 'Type DELETE')}
              className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
            />
            <button
              disabled={clearConfirmText !== 'DELETE'}
              onClick={async () => {
                await store.clearAll()
                setClearConfirmText('')
                onClose()
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                clearConfirmText === 'DELETE'
                  ? 'bg-red-600 text-white active:bg-red-700'
                  : 'bg-slate-800 text-gray-600 cursor-not-allowed'
              }`}>
              {L('Очистить', 'Clear all')}
            </button>
          </div>
        </div>

        {/* Diagnostics — fetchAll perf counter (Task 5 phase C). Refreshes every second. */}
        <MobileDiagnostics L={L} />

        {/* About */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{L('О приложении', 'About')}</div>
          <div className="text-xs text-gray-500 mb-3">Task Orchestrator PWA v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'}</div>
          <button
            onClick={async () => {
              const currentVer = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
              sessionStorage.setItem('pwa_update_check', currentVer)
              try {
                if ('serviceWorker' in navigator) {
                  const reg = await navigator.serviceWorker.getRegistration()
                  if (reg) {
                    await reg.update()
                    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
                  }
                }
                if ('caches' in window) {
                  const keys = await caches.keys()
                  await Promise.all(keys.map(k => caches.delete(k)))
                }
              } catch { /* ignore */ }
              window.location.reload()
            }}
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-slate-800 text-gray-300 active:bg-slate-700">
            <RefreshCw size={14} className="inline mr-2" />
            {L('Проверить обновления', 'Check for updates')}
          </button>
          {updateMsg && <div className={`text-xs mt-2 text-center ${updateMsg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{updateMsg.text}</div>}
        </div>
      </div>
    </div>
  )
}
