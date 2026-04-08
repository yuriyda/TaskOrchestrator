/**
 * @file AppContext.tsx
 * Application context — provides global state (locale, theme, settings) to all UI components.
 * Every component that needs t(), TC, settings, etc. consumes this via useApp().
 */
import { createContext, useContext } from "react";
import type { FlowMeta } from "../types";
import type { AppSettings } from "../hooks/useSettings";
import type { ThemeClasses } from "../core/themes";

export interface AppContextValue {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  resolvedTheme: string;
  TC: ThemeClasses;
  settings: AppSettings;
  updateSetting: (key: string, val: unknown) => void;
  lists: string[];
  tags: string[];
  flows: string[];
  flowMeta: Record<string, FlowMeta>;
  personas: string[];
  openUrl: (url: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppContext.Provider");
  return ctx;
}
