/**
 * @file MobileToasts.tsx
 * @description Bottom Undo toast + top "update-check" toast for MobileApp.
 * Undo button is hidden when undoAction.undo is null (fan-out completion).
 */
import { RefreshCw, X } from 'lucide-react'

interface UpdateMsg { text: string; ok: boolean }
interface UndoAction { label: string; undo: (() => void) | null }

interface Props {
  locale: string
  updateMsg: UpdateMsg | null
  setUpdateMsg: (v: UpdateMsg | null) => void
  undoAction: UndoAction | null
  clearUndo: () => void
}

export function MobileToasts({ locale, updateMsg, setUpdateMsg, undoAction, clearUndo }: Props) {
  return (
    <>
      {updateMsg && (
        <div className={`fixed top-16 left-4 right-4 z-40 flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg shadow-black/30 animate-[fadeIn_0.2s_ease-out] ${updateMsg.ok ? 'bg-emerald-900/90' : 'bg-slate-700'}`}>
          <RefreshCw size={14} className={updateMsg.ok ? 'text-emerald-400' : 'text-amber-400'} />
          <span className={`flex-1 text-sm ${updateMsg.ok ? 'text-emerald-200' : 'text-gray-200'}`}>{updateMsg.text}</span>
          <button onClick={() => setUpdateMsg(null)} className="text-gray-400 p-1"><X size={14} /></button>
        </div>
      )}
      {undoAction && (
        <div className="fixed bottom-24 left-4 right-4 z-30 flex items-center gap-3 bg-slate-700 rounded-xl px-4 py-3 shadow-lg shadow-black/30 animate-[fadeIn_0.2s_ease-out]">
          <span className="flex-1 text-sm text-gray-200">{undoAction.label}</span>
          {undoAction.undo && (
            <button onClick={() => { undoAction.undo!(); clearUndo() }}
              className="px-3 py-1 rounded-lg text-sm font-semibold text-sky-400 bg-sky-600/20 active:bg-sky-600/30">
              {locale === 'ru' ? 'Отменить' : 'Undo'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
