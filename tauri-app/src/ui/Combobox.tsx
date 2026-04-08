/**
 * @file Combobox.jsx
 * @description Styled replacement for <input list="..."> + <datalist>.
 *   options: string[] or { value, label }[]
 *   onCommit: if provided, selecting an option calls onCommit(value) and resets input to ""
 *             (used for multi-value tag/persona inputs)
 *   Without onCommit, selecting an option just sets the input value via onChange.
 */

import { useState, useRef, useEffect } from "react";
import type { CSSProperties, KeyboardEvent, FocusEvent } from "react";
import { useApp } from "./AppContext";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options?: (string | { value: string; label: string })[];
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onCommit?: (value: string) => void;
  autoFocus?: boolean;
}

export function Combobox({
  value, onChange, options = [], placeholder,
  className, style, onBlur, onKeyDown, onCommit, autoFocus,
}: ComboboxProps) {
  const { TC } = useApp();
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // typed: true once the user has changed the input since opening —
  // only then do we filter. On first open we show all options.
  const [typed, setTyped]         = useState(false);

  const normalized = options.map(o => typeof o === "string" ? { value: o, label: o } : o);
  const query    = (value || "").toLowerCase();
  const filtered = (typed && query)
    ? normalized.filter(o =>
        o.label.toLowerCase().includes(query) ||
        o.value.toLowerCase().includes(query))
    : normalized;

  const pickOption = (opt) => {
    if (onCommit) { onCommit(opt.value); onChange(""); }
    else          { onChange(opt.value); }
    setOpen(false);
    setActiveIdx(-1);
    setTyped(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && filtered.length) setOpen(true);
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && activeIdx >= 0 && open && filtered.length) {
      e.preventDefault();
      e.stopPropagation();
      pickOption(filtered[activeIdx]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setActiveIdx(-1);
      setTyped(false);
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        className={className}
        style={style}
        value={value || ""}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(-1); setTyped(true); }}
        onFocus={() => { if (normalized.length > 0) setOpen(true); setTyped(false); }}
        onBlur={e => { setOpen(false); setActiveIdx(-1); setTyped(false); onBlur?.(e); }}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div className={`absolute z-50 top-full left-0 mt-1 rounded-lg border shadow-2xl overflow-hidden ${TC.surface} ${TC.borderClass}`}
             style={{ minWidth: "100%", maxWidth: "360px" }}>
          <div className="overflow-y-auto" style={{ maxHeight: "180px" }}>
            {filtered.map((opt, i) => (
              <div
                key={opt.value}
                onMouseDown={e => { e.preventDefault(); pickOption(opt); }}
                className={`px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                  i === activeIdx
                    ? "bg-sky-500/20 text-sky-300"
                    : `${TC.text} ${TC.hoverBg}`
                }`}
              >
                {opt.label !== opt.value
                  ? <span>{opt.label}<span className={`ml-2 text-xs ${TC.textMuted}`}>{opt.value}</span></span>
                  : opt.label
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
