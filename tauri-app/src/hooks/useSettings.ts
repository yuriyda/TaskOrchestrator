/**
 * @file useSettings.ts
 * @description Custom hook encapsulating i18n, theme, settings state, and the
 *   translation helper `t()`. All persistence (localStorage + SQLite meta) is
 *   handled internally via the `saveMetaRef` bridge.
 */
import { useState, useEffect, type MutableRefObject } from "react";
import { LOCALES } from "../i18n/locales.js";
import { buildTC } from "../core/themes.js";

export interface AppSettings {
  firstDayOfWeek: number;
  dateFormat: string;
  fontFamily: string;
  fontSize: string;
  condense: boolean;
  colorTheme: string;
  clockFormat: string;
  newTaskActiveToday: boolean;
  autoSync: boolean;
  autoExtractUrl: boolean;
  plannerDayStart?: number;
  plannerDayEnd?: number;
  plannerSlotStep?: number;
  [key: string]: unknown;
}

type SaveMetaFn = ((key: string, value: string) => void) | null;

const SETTINGS_DEFAULTS: AppSettings = {
  firstDayOfWeek: 1, dateFormat: "iso", fontFamily: "", fontSize: "normal",
  condense: false, colorTheme: "default", clockFormat: "24h",
  newTaskActiveToday: false, autoSync: true, autoExtractUrl: true,
};

export function useSettings(saveMetaRef: MutableRefObject<SaveMetaFn>) {
  const [guideStep, setGuideStep] = useState(-1);

  const [locale, setLocale] = useState(() => {
    try { return localStorage.getItem("to_locale") || "en"; } catch { return "en"; }
  });
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("to_theme") || "auto"; } catch { return "auto"; }
  });

  const [showSettings, setShowSettings] = useState<false | string>(false);
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem("to_settings");
      return saved ? { ...SETTINGS_DEFAULTS, ...JSON.parse(saved) } : { ...SETTINGS_DEFAULTS };
    } catch { return { ...SETTINGS_DEFAULTS }; }
  });

  const updateSetting = (key: string, val: unknown) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem("to_settings", JSON.stringify(next)); } catch {}
      saveMetaRef.current?.("to_settings", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    try { localStorage.setItem("to_locale", locale); } catch {}
    saveMetaRef.current?.("to_locale", locale);
  }, [locale]);
  useEffect(() => {
    try { localStorage.setItem("to_theme", theme); } catch {}
    saveMetaRef.current?.("to_theme", theme);
  }, [theme]);

  const [resolvedTheme, setResolvedTheme] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  useEffect(() => {
    if (theme !== "auto") { setResolvedTheme(theme); return; }
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? "dark" : "light");
    setResolvedTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const TC = buildTC(resolvedTheme, settings.colorTheme);

  const t = (key: string, params: Record<string, string | number> = {}): string => {
    const dict = (LOCALES as Record<string, Record<string, string>>)[locale] || (LOCALES as Record<string, Record<string, string>>).en;
    let s = dict[key] ?? (LOCALES as Record<string, Record<string, string>>).en[key] ?? key;
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  const applyMeta = (metaSettings: Record<string, string>) => {
    if (metaSettings["to_locale"]) setLocale(metaSettings["to_locale"]);
    if (metaSettings["to_theme"])  setTheme(metaSettings["to_theme"]);
    if (metaSettings["to_settings"]) {
      try {
        const loaded = JSON.parse(metaSettings["to_settings"]);
        setSettingsState(() => ({ ...SETTINGS_DEFAULTS, ...loaded }));
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
