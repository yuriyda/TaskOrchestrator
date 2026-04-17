/**
 * @file common.jsx
 * Shared presentational components used across the task management UI.
 * TokenChip / ChipPill — quick-entry token display and editable pill with remove button.
 * SectionDivider — labeled horizontal rule for overdue/section breaks.
 * ConfirmDialog — modal yes/cancel dialog with keyboard shortcuts (Enter / Escape).
 * BulkBar — floating toolbar for bulk-actions on selected tasks.
 * ToastContainer — stacked notification toasts anchored to bottom-right.
 */
import { useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { CHIP_STYLE } from "../parse/quickEntry.js";
import { useApp } from "./AppContext.jsx";

interface TokenChipProps {
  token: { type: string; value: string };
}

export function TokenChip({ token }: TokenChipProps) {
  const s = CHIP_STYLE[token.type] || CHIP_STYLE.text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 500, fontFamily: "monospace", whiteSpace: "nowrap", ...s }}>
      {token.value}
    </span>
  );
}

// Committed chip pill rendered inside the input field.
interface ChipPillProps {
  chip: { type: string; raw: string };
  onRemove: () => void;
}

export function ChipPill({ chip, onRemove }: ChipPillProps) {
  const s = CHIP_STYLE[chip.type] || CHIP_STYLE.text;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 500,
                   fontFamily: "monospace", whiteSpace: "nowrap", userSelect: "none", flexShrink: 0, ...s }}>
      {chip.raw}
      <button type="button" tabIndex={-1}
        onClick={e => { e.stopPropagation(); onRemove(); }}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 1px",
                 lineHeight: 1, opacity: 0.65, color: "inherit", fontSize: 13 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.65")}>
        ×
      </button>
    </span>
  );
}

interface SectionDividerProps {
  label: string;
  count: number;
  onClick?: () => void;
}

export function SectionDivider({ label, count, onClick }: SectionDividerProps) {
  const { TC } = useApp();
  return (
    <div className={`flex items-center gap-2.5 py-0.5${onClick ? " cursor-pointer group" : ""}`} onClick={onClick}>
      <span className={`text-xs font-semibold uppercase tracking-widest text-red-400/80 flex items-center gap-1.5${onClick ? " group-hover:text-red-300" : ""}`}>
        <AlertTriangle size={11} className="text-red-400/70" />
        {label}
        <span className="text-xs font-normal normal-case tracking-normal bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full">{count}</span>
      </span>
      <div className={`flex-1 h-px border-t border-red-500/20`} />
    </div>
  );
}

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t, TC } = useApp();
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: "rgba(0,0,0,0.55)" }}
         onMouseDown={e => { if (e.target === e.currentTarget) e.currentTarget.dataset.bd = "1"; }}
         onClick={e => { if (e.currentTarget.dataset.bd) { delete e.currentTarget.dataset.bd; onCancel(); } }}>
      <div className={`border rounded-xl shadow-2xl p-6 w-72 ${TC.surface} ${TC.borderClass}`}
           onClick={e => e.stopPropagation()}>
        <p className={`text-sm font-medium text-center mb-5 ${TC.text}`}>{message}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onConfirm}
            className="px-5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            {t("confirm.yes")}
            <kbd className="text-xs bg-sky-500/40 text-white/80 px-1 py-0.5 rounded font-mono leading-none">↵</kbd>
          </button>
          <button onClick={onCancel}
            className={`px-5 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${TC.elevated} ${TC.textSec}`}>
            {t("confirm.cancel")}
            <kbd className={`text-xs px-1 py-0.5 rounded font-mono leading-none opacity-60 ${TC.surface}`}>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

interface BulkBarProps {
  count: number;
  onDone: () => void;
  onCycle: () => void;
  onShift: () => void;
  onToday: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkBar({ count, onDone, onCycle, onShift, onToday, onDelete, onClear }: BulkBarProps) {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-sky-900/30 border border-sky-500/30 rounded-lg flex-wrap">
      <span className="text-sky-300 text-sm font-medium">{count} {t("bulk.selected")}</span>
      <div className="flex gap-2 ml-auto flex-wrap">
        <button onClick={onDone}   className="px-3 py-1 bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded hover:bg-emerald-600/50 transition-colors text-xs">{t("bulk.complete")}</button>
        <button onClick={onCycle}  className="px-3 py-1 bg-gray-700/50 text-gray-300 border border-gray-600 rounded hover:bg-gray-700 transition-colors text-xs">{t("bulk.cycle")}</button>
        <button onClick={onToday}  className="px-3 py-1 bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded hover:bg-sky-600/50 transition-colors text-xs">{t("bulk.today")}</button>
        <button onClick={onShift}  className="px-3 py-1 bg-violet-600/30 text-violet-300 border border-violet-500/30 rounded hover:bg-violet-600/50 transition-colors text-xs">{t("bulk.shift")}</button>
        <button onClick={onDelete} className="px-3 py-1 bg-red-600/30 text-red-300 border border-red-500/30 rounded hover:bg-red-600/50 transition-colors text-xs">{t("bulk.delete")}</button>
        <button onClick={onClear}  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"><X size={14} /></button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: { id: string; msg: string }[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  const { TC } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`border px-4 py-2.5 rounded-lg shadow-xl text-sm ${TC.surface} ${TC.borderClass} ${TC.text}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
