/**
 * @file useSettings.jsx
 * @description Custom hook encapsulating i18n, theme, settings state, and the
 *   translation helper `t()`. Extracted from task-orchestrator.jsx to reduce
 *   the main component's size. All persistence (localStorage + SQLite meta) is
 *   handled internally via the `saveMetaRef` bridge.
 *
 * @returns {{ guideStep, setGuideStep, locale, setLocale, theme, setTheme,
 *   resolvedTheme, TC, t, settings, updateSetting, showSettings, setShowSettings }}
 */
import { useState, useEffect } from "react";
import { LOCALES } from "../tauri-app/src/i18n/locales.js";
import { buildTC } from "../tauri-app/src/core/themes.js";

const SETTINGS_DEFAULTS = {
  firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal",
  condense: false, colorTheme: "default", clockFormat: "24h",
  newTaskActiveToday: false, autoSync: true, autoExtractUrl: true,
};

export function useSettings(saveMetaRef) {
  // ── UI Guide state ──────────────────────────────────────────────────────
  const [guideStep, setGuideStep] = useState(-1);

  // ── i18n / theme state ────────────────────────────────────────────────────
  const [locale, setLocale] = useState(() => {
    try { return localStorage.getItem("to_locale") || "en"; } catch { return "en"; }
  });
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("to_theme") || "auto"; } catch { return "auto"; }
  });

  // ── Settings state ────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettingsState] = useState(() => {
    try {
      const saved = localStorage.getItem("to_settings");
      return saved ? { ...SETTINGS_DEFAULTS, ...JSON.parse(saved) } : { ...SETTINGS_DEFAULTS };
    } catch { return { ...SETTINGS_DEFAULTS }; }
  });

  const updateSetting = (key, val) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem("to_settings", JSON.stringify(next)); } catch {}
      saveMetaRef.current?.("to_settings", JSON.stringify(next));
      return next;
    });
  };

  // Persist locale and theme changes
  useEffect(() => {
    try { localStorage.setItem("to_locale", locale); } catch {}
    saveMetaRef.current?.("to_locale", locale);
  }, [locale]);
  useEffect(() => {
    try { localStorage.setItem("to_theme", theme); } catch {}
    saveMetaRef.current?.("to_theme", theme);
  }, [theme]);

  // ── Resolved theme (auto → system preference) ────────────────────────────
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  useEffect(() => {
    if (theme !== "auto") { setResolvedTheme(theme); return; }
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => setResolvedTheme(e.matches ? "dark" : "light");
    setResolvedTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // ── Theme class map ───────────────────────────────────────────────────────
  const TC = buildTC(resolvedTheme, settings.colorTheme);

  // ── Translation helper ────────────────────────────────────────────────────
  const t = (key, params = {}) => {
    let s = (LOCALES[locale] || LOCALES.en)[key] ?? LOCALES.en[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  /** Apply settings loaded from SQLite meta table (call once when metaSettings arrives). */
  const applyMeta = (metaSettings) => {
    if (metaSettings["to_locale"]) setLocale(metaSettings["to_locale"]);
    if (metaSettings["to_theme"])  setTheme(metaSettings["to_theme"]);
    if (metaSettings["to_settings"]) {
      try {
        const loaded = JSON.parse(metaSettings["to_settings"]);
        setSettingsState(prev => ({ ...SETTINGS_DEFAULTS, ...loaded }));
      } catch {}
    }
    if (metaSettings["to_guide_completed"] !== "true") {
      setGuideStep(0);
    }
  };

  return {
    guideStep, setGuideStep,
    locale, setLocale,
    theme, setTheme,
    resolvedTheme, TC, t,
    settings, updateSetting,
    showSettings, setShowSettings,
    applyMeta,
  };
}
