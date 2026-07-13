/**
 * Focus Bar configuration — defaults and resolver.
 *
 * Stored inside the regular `to_settings` blob under the `focusBar` key.
 * Settings are shallow-merged over SETTINGS_DEFAULTS in useSettings, so this
 * resolver deep-merges the nested objects to keep old persisted configs
 * forward-compatible when new modules/options appear.
 *
 * Philosophy: the bar exists to keep the CURRENT task in sight. The default
 * composition is minimal (task + timer + controls); everything else is opt-in.
 */

export interface FocusBarModules {
  timer: boolean
  presets: boolean
  controls: boolean
  waiting: boolean
  counter: boolean
  nextSlot: boolean
  clock: boolean
}

export interface FocusBarConfig {
  enabled: boolean
  /** 'appbar' reserves work-area space (Windows); 'overlay' floats on top. */
  mode: 'appbar' | 'overlay'
  /** 'auto' ≈ 1/33 of the screen height (clamped); 'compact' = one thin row. */
  size: 'auto' | 'compact'
  modules: FocusBarModules
  /** presets — interval buttons on the bar, minutes each. */
  pomodoro: { presets: number[]; breakMin: number }
}

export const FOCUS_BAR_DEFAULTS: FocusBarConfig = {
  enabled: false,
  mode: 'appbar',
  size: 'auto',
  modules: {
    timer: true,
    presets: true,
    controls: true,
    waiting: true,
    counter: false,
    nextSlot: false,
    clock: false,
  },
  pomodoro: { presets: [15, 30, 45, 60], breakMin: 5 },
}

/** True when running inside the Tauri desktop shell (not jsdom/PWA/browser). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function getFocusBarConfig(settings: any): FocusBarConfig {
  const fb: Partial<FocusBarConfig> = settings?.focusBar ?? {}
  const pomodoro = { ...FOCUS_BAR_DEFAULTS.pomodoro, ...(fb.pomodoro ?? {}) }
  // Configs saved before the preset list existed carry {work, longWork} —
  // the defaults above already replace them; just guard the shape.
  if (!Array.isArray(pomodoro.presets) || pomodoro.presets.length === 0) {
    pomodoro.presets = [...FOCUS_BAR_DEFAULTS.pomodoro.presets]
  }
  return {
    ...FOCUS_BAR_DEFAULTS,
    ...fb,
    modules: { ...FOCUS_BAR_DEFAULTS.modules, ...(fb.modules ?? {}) },
    pomodoro,
  }
}
