/**
 * @file FocusBar.tsx
 * The Focus Bar window content — a thin client rendered in the `focusbar`
 * webview. It owns NO data: the main window streams state via the
 * 'focus:state' event and executes every mutation it requests via
 * 'focus:cmd' (see hooks/useFocusController.ts). The bar itself only keeps
 * a 1-second tick to redraw wall-clock countdowns.
 *
 * Layout is three-zone: [status + presets] [current task — centered on the
 * monitor] [waiting chips + info + hide]. The side zones are equal flex-1,
 * which keeps the middle zone at the true horizontal center of the screen.
 */

import { useEffect, useRef, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Check, Hourglass, Pause, Play, SkipForward, Square, X } from "lucide-react";
import { buildTC } from "../core/themes";
import { LOCALES } from "../i18n/locales";
import {
  getActive, getWaiting, pomodoroRemainingMs, todayCount, waitingMs,
  type FocusState,
} from "../core/focusSession";
import type { FocusBarConfig } from "../core/focusConfig";

interface SlotInfo { endTime?: string; startTime?: string; taskId: string | null; title: string }

interface FocusBarPayload {
  cfg: FocusBarConfig;
  locale: string;
  state: FocusState;
  titles: Record<string, string>;
  currentSlot: SlotInfo | null;
  nextSlot: SlotInfo | null;
}

// Broadcast (emit) instead of targeted emitTo: survives any label/target
// matching quirks — the only listener for 'focus:cmd' lives in the main window.
const cmd = (payload: Record<string, unknown>) => { emit("focus:cmd", payload).catch(() => {}); };

// The ✕ normally asks the main-window controller to disable the bar (so the
// setting flips and the strip is released). If the controller is gone, the
// command lands nowhere — so after a grace period the bar undocks and closes
// itself. When both paths run, the second close is a harmless no-op.
const hideBar = () => {
  cmd({ type: "hide" });
  setTimeout(async () => {
    try { await invoke("appbar_undock", { label: "focusbar" }); } catch { /* already undocked */ }
    try { await getCurrentWebviewWindow().close(); } catch { /* already closed */ }
  }, 600);
};

function fmtMMSS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TomatoIcon({ phase }: { phase: "idle" | "work" | "break" }) {
  const body = phase === "work" ? "#ef4444" : phase === "break" ? "#4ade80" : "#9ca3af";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="flex-shrink-0" aria-hidden="true">
      <circle cx="8" cy="9.5" r="6" fill={body} />
      <path d="M8 1.5 C7 3 5.5 3.5 4.5 3.5 C6 4.5 7 4.5 8 4 C9 4.5 10 4.5 11.5 3.5 C10.5 3.5 9 3 8 1.5 Z" fill="#22c55e" />
    </svg>
  );
}

export default function FocusBar() {
  const [payload, setPayload] = useState<FocusBarPayload | null>(null);
  const [, setTick] = useState(0);
  const gotStateRef = useRef(false);

  // Theme comes straight from localStorage — WebView2 windows of one app
  // share the same profile, so the main window's choice is already there.
  const [TC] = useState(() => {
    let theme = "auto", colorTheme = "default";
    try { theme = localStorage.getItem("to_theme") || "auto"; } catch { /* ignore */ }
    try { colorTheme = JSON.parse(localStorage.getItem("to_settings") || "{}").colorTheme || "default"; } catch { /* ignore */ }
    const resolved = theme === "auto"
      ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    return buildTC(resolved, colorTheme);
  });

  useEffect(() => {
    const un = listen<FocusBarPayload>("focus:state", (e) => {
      gotStateRef.current = true;
      setPayload(e.payload);
    });
    // Announce readiness; retry until the controller answers with state
    // (covers the race where the bar loads before the listener is live).
    cmd({ type: "ready" });
    const retry = setInterval(() => {
      if (gotStateRef.current) { clearInterval(retry); return; }
      cmd({ type: "ready" });
    }, 700);
    const tick = setInterval(() => setTick(n => n + 1), 1000);
    return () => { un.then(f => f()); clearInterval(retry); clearInterval(tick); };
  }, []);

  const locale = payload?.locale || (() => { try { return localStorage.getItem("to_locale") || "en"; } catch { return "en"; } })();
  const t = (key: string, params: Record<string, string | number> = {}): string => {
    const dicts = LOCALES as Record<string, Record<string, string>>;
    let s = (dicts[locale] ?? dicts.en)[key] ?? dicts.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  const now = new Date().toISOString();
  const state = payload?.state;
  const cfg = payload?.cfg;
  const mods = cfg?.modules;
  const active = state ? getActive(state) : null;
  const waiting = state ? getWaiting(state) : [];
  const pomodoro = state?.pomodoro;
  const remainingMs = pomodoro ? pomodoroRemainingMs(pomodoro, now) : 0;
  const running = pomodoro != null && pomodoro.phase !== "idle";
  const paused = running && pomodoro.pausedAt != null;
  const progress = running && pomodoro.plannedMin > 0
    ? Math.min(1, 1 - remainingMs / (pomodoro.plannedMin * 60_000))
    : 0;
  const titleOf = (taskId: string) => payload?.titles?.[taskId] ?? "…";
  const waitingVisible = waiting.slice(0, 3);
  const waitingOverflow = waiting.length - waitingVisible.length;

  // "45′" for sub-hour presets, "1ч"/"1h" for whole hours
  const fmtPreset = (m: number) =>
    m >= 60 && m % 60 === 0 ? `${m / 60}${t("focus.hourShort")}` : `${m}${"′"}`;

  const btnCls = `flex-shrink-0 flex items-center px-1 py-0.5 rounded transition-colors cursor-pointer opacity-70 hover:opacity-100 leading-tight ${TC.hoverBg}`;
  const chipCls = `flex-shrink-0 flex items-center gap-1 px-1.5 h-[18px] rounded-full border ${TC.borderClass} ${TC.elevated} text-[11px] leading-tight cursor-pointer opacity-80 hover:opacity-100`;

  return (
    <div className={`relative h-screen w-screen flex items-center gap-2 px-2 border-b overflow-hidden select-none ${TC.root} ${TC.borderClass}`}>

      {/* ── Left zone: status icon + interval presets ── */}
      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
        <TomatoIcon phase={pomodoro?.phase ?? "idle"} />
        {mods?.presets && cfg && (
          <span className={`flex items-center gap-0.5 flex-shrink-0 text-[11px] leading-tight ${TC.textSec}`}>
            {(cfg.pomodoro.presets ?? []).map(m => (
              <button key={m} className={btnCls} onClick={() => cmd({ type: "pomodoro-start", minutes: m })}>
                {fmtPreset(m)}
              </button>
            ))}
            {payload?.currentSlot?.endTime && (
              <button className={btnCls} title={t("focus.untilSlotEndHint")} onClick={() => cmd({ type: "pomodoro-start", preset: "slot" })}>
                {t("focus.untilSlotEnd", { time: payload.currentSlot.endTime })}
              </button>
            )}
          </span>
        )}
      </div>

      {/* ── Center zone: the current focus, strictly centered on the monitor ── */}
      <div className="flex items-center gap-1.5 min-w-0 max-w-[60vw]">
        {pomodoro?.phase === "break" ? (
          <>
            <span className="text-[13px] leading-tight font-medium text-green-400 flex-shrink-0">{t("focus.break")}</span>
            {mods?.timer && <span className="text-[13px] leading-tight tabular-nums flex-shrink-0">{fmtMMSS(remainingMs)}</span>}
            <button className={btnCls} title={t("focus.skipBreak")} onClick={() => cmd({ type: "pomodoro-stop" })}>
              <SkipForward size={12} />
            </button>
            {active && <span className={`truncate text-[11px] leading-tight ${TC.textMuted}`}>{titleOf(active.taskId)}</span>}
          </>
        ) : active ? (
          <>
            <button
              className="min-w-0 truncate text-[13px] leading-tight font-medium text-left cursor-pointer hover:underline"
              title={titleOf(active.taskId)}
              onClick={() => cmd({ type: "open-task", taskId: active.taskId })}
            >
              {titleOf(active.taskId)}
            </button>
            {mods?.timer && running && (
              <span className={`text-[13px] leading-tight tabular-nums flex-shrink-0 ${paused ? "opacity-50" : ""}`}>{fmtMMSS(remainingMs)}</span>
            )}
            {mods?.controls && (
              <span className="flex items-center flex-shrink-0">
                {running && (paused
                  ? <button className={btnCls} title={t("focus.resume")} onClick={() => cmd({ type: "pomodoro-resume" })}><Play size={12} /></button>
                  : <button className={btnCls} title={t("focus.pause")} onClick={() => cmd({ type: "pomodoro-pause" })}><Pause size={12} /></button>
                )}
                {running && (
                  <button className={btnCls} title={t("focus.stop")} onClick={() => cmd({ type: "pomodoro-stop" })}><Square size={11} /></button>
                )}
                <button className={`${btnCls} text-green-400`} title={t("focus.done")} onClick={() => cmd({ type: "done", taskId: active.taskId })}><Check size={13} /></button>
                <button className={btnCls} title={t("focus.park")} onClick={() => cmd({ type: "park" })}><Hourglass size={11} /></button>
              </span>
            )}
          </>
        ) : (
          <>
            <button className={`text-[13px] leading-tight italic ${TC.textMuted} cursor-pointer hover:underline flex-shrink-0`} onClick={() => cmd({ type: "open-main" })}>
              {t("focus.pickTask")}
            </button>
            {payload?.currentSlot?.taskId && (
              <button className={chipCls} title={t("focus.fromSchedule")} onClick={() => cmd({ type: "activate", taskId: payload.currentSlot!.taskId })}>
                <Play size={10} className="text-sky-400" />
                <span className="truncate max-w-[180px]">{payload.currentSlot.title}</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Right zone: waiting chips + info modules + hide ── */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5 overflow-hidden">
        {mods?.waiting && waitingVisible.map(s => (
          <span key={s.taskId} className={chipCls} title={`${titleOf(s.taskId)} — ${t("focus.waitingFor", { min: Math.floor(waitingMs(s, now) / 60_000) })}`} onClick={() => cmd({ type: "activate", taskId: s.taskId })}>
            <Hourglass size={10} className="text-amber-400 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{titleOf(s.taskId)}</span>
            <span className={`tabular-nums ${TC.textMuted}`}>{Math.floor(waitingMs(s, now) / 60_000)}{t("focus.minShort")}</span>
            <span
              role="button"
              className="opacity-40 hover:opacity-100 cursor-pointer"
              title={t("focus.remove")}
              onClick={(e) => { e.stopPropagation(); cmd({ type: "remove", taskId: s.taskId }); }}
            >
              <X size={10} />
            </span>
          </span>
        ))}
        {mods?.waiting && waitingOverflow > 0 && (
          <span className={`flex-shrink-0 text-[11px] leading-tight ${TC.textMuted}`} title={waiting.slice(3).map(s => titleOf(s.taskId)).join("\n")}>
            +{waitingOverflow}
          </span>
        )}
        {mods?.counter && state && (
          <span className="flex-shrink-0 text-[11px] leading-tight tabular-nums" title={t("focus.todayCount")}>
            {"🍅"}{"×"}{todayCount(state, now)}
          </span>
        )}
        {mods?.nextSlot && payload?.nextSlot && (
          <span className={`flex-shrink-0 text-[11px] leading-tight truncate max-w-[220px] ${TC.textMuted}`}>
            {t("focus.next")} {payload.nextSlot.startTime} {"·"} {payload.nextSlot.title}
          </span>
        )}
        {mods?.clock && (
          <span className={`flex-shrink-0 text-[11px] leading-tight tabular-nums ${TC.textSec}`}>
            {new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button className={btnCls} title={t("focus.hideBar")} onClick={hideBar}>
          <X size={12} />
        </button>
      </div>

      {/* ── Progress line along the bottom edge ── */}
      {running && (
        <span
          className={`absolute bottom-0 left-0 h-[2px] ${pomodoro!.phase === "break" ? "bg-green-400" : "bg-red-400"}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      )}
    </div>
  );
}
