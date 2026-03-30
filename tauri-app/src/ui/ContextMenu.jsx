/**
 * @file ContextMenu.jsx
 * @description Right-click context menu for task rows. Supports single and
 *   multi-selection actions: set status, open, snooze, duplicate, delete.
 *   Automatically clamps its position so it never overflows the viewport.
 */

import { useRef, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "./AppContext";
import { STATUS_ICONS, STATUSES } from "../core/constants";

export function ContextMenu({ x, y, task, selectedIds, onClose, onOpen, onSnooze, onAssignToday, onSetStatus, onMarkDone, onDuplicate, onDelete }) {
  const { t, TC } = useApp();
  const ref = useRef(null);
  const isMulti = selectedIds.size > 1 && selectedIds.has(task.id);
  const ids = isMulti ? selectedIds : new Set([task.id]);
  const n = ids.size;

  // Close on outside click, Escape, or scroll
  useEffect(() => {
    const onDown  = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey   = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    document.addEventListener("scroll",    onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
      document.removeEventListener("scroll",    onScroll, true);
    };
  }, [onClose]);

  // Clamp position so the menu doesn't overflow the viewport
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({
      left: x + rect.width  > vw ? Math.max(0, vw - rect.width  - 8) : x,
      top:  y + rect.height > vh ? Math.max(0, vh - rect.height - 8) : y,
    });
  }, [x, y]);

  const Sep = ({ id }) => <div key={id} className={`my-1 border-t ${TC.borderClass}`} />;

  const Item = ({ label, onClick: act, danger = false }) => (
    <button
      className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors
        ${danger ? "text-red-400 hover:bg-red-500/10" : `${TC.text} hover:bg-sky-500/10`}`}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); act(); }}
    >
      {label}
    </button>
  );

  const [subOpen, setSubOpen] = useState(null);
  const subTimer = useRef(null);
  const SubMenu = ({ id, label, children }) => {
    const itemRef = useRef(null);
    const open = subOpen === id;
    return (
      <div ref={itemRef} className="relative"
        onMouseEnter={() => { clearTimeout(subTimer.current); setSubOpen(id); }}
        onMouseLeave={() => { subTimer.current = setTimeout(() => setSubOpen(null), 200); }}
      >
        <button className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors flex items-center justify-between ${TC.text} hover:bg-sky-500/10`}>
          {label} <ChevronRight size={12} className={TC.textMuted} />
        </button>
        {open && (
          <div className={`${TC.surface} border ${TC.borderClass} rounded-lg shadow-2xl py-1 px-1`}
            style={{ position: "absolute", left: "100%", top: 0, minWidth: 160, width: "fit-content", display: "inline-block" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ref}
      className={`${TC.surface} border ${TC.borderClass} rounded-lg shadow-2xl py-1 px-1`}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 999, minWidth: 200, maxWidth: 280, width: "fit-content", display: "inline-block" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isMulti && (
        <>
          <div className={`px-3 py-1.5 text-xs font-semibold tracking-wide ${TC.textMuted}`}>
            {t("ctx.selectedCount").replace("{n}", n)}
          </div>
          <Sep id="s0" />
        </>
      )}
      <SubMenu id="status" label={t("ctx.setStatus")}>
        {STATUSES.map(s => {
          const Icon = STATUS_ICONS[s];
          return (
            <button key={s}
              className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-2 ${TC.text} hover:bg-sky-500/10`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSetStatus(ids, s); }}>
              <Icon size={13} /> {t("status." + s)}
            </button>
          );
        })}
      </SubMenu>
      {!isMulti && <Item label={t("ctx.open")}      onClick={() => onOpen(task.id)} />}
      <Sep id="s1" />
      <Item label={t("bulk.today")}   onClick={() => onAssignToday(ids)} />
      <Item label={t("ctx.snooze1d")} onClick={() => onSnooze(ids, 1, 0)} />
      <Item label={t("ctx.snooze1w")} onClick={() => onSnooze(ids, 7, 0)} />
      <Item label={t("ctx.snooze1m")} onClick={() => onSnooze(ids, 0, 1)} />
      <Sep id="s2" />
      {!isMulti && <Item label={t("ctx.duplicate")} onClick={() => onDuplicate(task.id)} />}
      <Sep id="s3" />
      <Item label={isMulti ? t("ctx.deleteSelected") : t("ctx.delete")} onClick={() => onDelete(ids)} danger />
    </div>
  );
}
