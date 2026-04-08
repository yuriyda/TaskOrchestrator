/**
 * @file GuideOverlay.jsx
 * @description Interactive onboarding guide overlay with step-by-step highlights.
 */

import { useState, useEffect, useRef } from "react";
import { useApp } from "./AppContext";

export const GUIDE_STEPS = [
  { target: "sidebar",      titleKey: "guide.step.sidebar.title",      descKey: "guide.step.sidebar.desc" },
  { target: "search",       titleKey: "guide.step.search.title",       descKey: "guide.step.search.desc" },
  { target: "create-task",  titleKey: "guide.step.createTask.title",   descKey: "guide.step.createTask.desc" },
  { target: "sort-filter",  titleKey: "guide.step.sortFilter.title",   descKey: "guide.step.sortFilter.desc" },
  { target: "task-row",     titleKey: "guide.step.taskRow.title",      descKey: "guide.step.taskRow.desc" },
  { target: "detail-panel", titleKey: "guide.step.detailPanel.title",  descKey: "guide.step.detailPanel.desc" },
];

export function GuideOverlay({ step, total, target, titleKey, descKey, onNext, onBack, onSkip }) {
  const { t, TC } = useApp();
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const recalc = () => {
      const el = document.querySelector(`[data-guide="${target}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else setRect(null);
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [target]);

  if (!rect) return null;

  const pad = 8;
  const cx = rect.left - pad;
  const cy = rect.top - pad;
  const cw = rect.width + pad * 2;
  const ch = rect.height + pad * 2;

  // Smart tooltip positioning: try bottom → top → right → left
  const tipW = 320;
  const tipH = 180; // estimated height
  const tipGap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let tipStyle = {};
  const spaceBottom = vh - (cy + ch);
  const spaceTop = cy;
  const spaceRight = vw - (cx + cw);
  const spaceLeft = cx;

  if (spaceBottom >= tipH + tipGap) {
    // Place below
    tipStyle = { top: cy + ch + tipGap, left: Math.max(8, Math.min(cx, vw - tipW - 8)) };
  } else if (spaceTop >= tipH + tipGap) {
    // Place above
    tipStyle = { top: cy - tipGap - tipH, left: Math.max(8, Math.min(cx, vw - tipW - 8)) };
  } else if (spaceRight >= tipW + tipGap) {
    // Place to the right
    tipStyle = { left: cx + cw + tipGap, top: Math.max(8, Math.min(cy, vh - tipH - 8)) };
  } else if (spaceLeft >= tipW + tipGap) {
    // Place to the left
    tipStyle = { left: cx - tipW - tipGap, top: Math.max(8, Math.min(cy, vh - tipH - 8)) };
  } else {
    // Fallback: center of screen
    tipStyle = { left: (vw - tipW) / 2, top: Math.max(8, vh - tipH - 16) };
  }

  const isFirst = step === 0;
  const isLast = step === total - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      {/* SVG overlay with cutout mask */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="guide-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={cx} y={cy} width={cw} height={ch} rx={8} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#guide-mask)" />
      </svg>

      {/* Highlight border around target */}
      <div style={{
        position: "absolute", left: cx, top: cy, width: cw, height: ch,
        borderRadius: 8, border: "2px solid rgba(14,165,233,0.6)",
        boxShadow: "0 0 0 4px rgba(14,165,233,0.15)",
        pointerEvents: "none",
      }} />

      {/* Tooltip card */}
      <div
        style={{ position: "absolute", width: tipW, ...tipStyle }}
        className="rounded-xl shadow-2xl border border-slate-600 p-4 bg-slate-800 text-slate-100"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">
            {step + 1} {t("guide.stepOf")} {total}
          </span>
          <button onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
            {t("guide.skip")}
          </button>
        </div>
        <h3 className="text-sm font-semibold mb-1 text-white">{t(titleKey)}</h3>
        <p className="text-xs leading-relaxed mb-4 text-slate-300">{t(descKey)}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            disabled={isFirst}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
              ${isFirst ? "opacity-30 cursor-default text-slate-500" : "text-slate-300 hover:bg-slate-700"}`}
          >
            {t("guide.back")}
          </button>
          <button
            onClick={onNext}
            className="px-4 py-1.5 text-xs rounded-lg font-medium bg-sky-600 text-white hover:bg-sky-500 transition-colors"
          >
            {isLast ? t("guide.done") : t("guide.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
