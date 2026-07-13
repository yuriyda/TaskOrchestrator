/**
 * @file FocusTab.tsx
 * Settings tab for the Focus Bar: visibility, docking mode, height, the set
 * of modules shown on the bar, and pomodoro durations. Desktop-only — the
 * tab is not registered when running outside the Tauri shell.
 */

import { useApp } from "../AppContext";
import { SettingRow } from "../SettingsDialog";
import { getFocusBarConfig, type FocusBarConfig, type FocusBarModules } from "../../core/focusConfig";

const MODULE_KEYS: (keyof FocusBarModules)[] = [
  "timer", "presets", "controls", "waiting", "counter", "nextSlot", "clock",
];

export function FocusTab() {
  const { t, TC, settings, updateSetting } = useApp();
  const cfg = getFocusBarConfig(settings);

  const save = (patch: Partial<FocusBarConfig>) => updateSetting("focusBar", { ...cfg, ...patch });
  const saveModule = (key: keyof FocusBarModules, val: boolean) =>
    save({ modules: { ...cfg.modules, [key]: val } });

  const savePresets = (raw: string) => {
    const presets = raw
      .split(/[,;\s]+/)
      .map(v => Math.round(Number(v)))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 480)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 6);
    if (presets.length > 0) save({ pomodoro: { ...cfg.pomodoro, presets } });
  };

  const onBtn = (active: boolean) =>
    `px-3 py-1.5 rounded text-sm transition-colors font-medium ${active ? "bg-sky-600 text-white" : `${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200`}`;

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} className={onBtn(value)}>
      {value ? "ON" : "OFF"}
    </button>
  );

  return (
    <div>
      <h2 className={`text-base font-semibold mb-1 ${TC.text}`}>{t("settings.focus.title")}</h2>
      <p className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.focus.desc")}</p>
      <div className={`divide-y ${TC.borderClass}`}>
        <SettingRow label={t("settings.focus.enabled")}>
          <Toggle value={cfg.enabled} onChange={v => save({ enabled: v })} />
        </SettingRow>

        <SettingRow label={t("settings.focus.mode")} description={t("settings.focus.modeDesc")}>
          <div className="flex gap-1.5">
            <button onClick={() => save({ mode: "appbar" })} className={onBtn(cfg.mode === "appbar")}>
              {t("settings.focus.mode.appbar")}
            </button>
            <button onClick={() => save({ mode: "overlay" })} className={onBtn(cfg.mode === "overlay")}>
              {t("settings.focus.mode.overlay")}
            </button>
          </div>
        </SettingRow>

        <SettingRow label={t("settings.focus.size")}>
          <div className="flex gap-1.5">
            <button onClick={() => save({ size: "auto" })} className={onBtn(cfg.size === "auto")}>
              {t("settings.focus.size.auto")}
            </button>
            <button onClick={() => save({ size: "compact" })} className={onBtn(cfg.size === "compact")}>
              {t("settings.focus.size.compact")}
            </button>
          </div>
        </SettingRow>

        <SettingRow label={t("settings.focus.modules")} description={t("settings.focus.modulesDesc")}>
          <div className="flex flex-col gap-1.5">
            {MODULE_KEYS.map(key => (
              <label key={key} className={`flex items-center gap-2 text-sm cursor-pointer ${TC.text}`}>
                <input
                  type="checkbox"
                  checked={cfg.modules[key]}
                  onChange={e => saveModule(key, e.target.checked)}
                  className="accent-sky-600"
                />
                {t(`settings.focus.module.${key}`)}
              </label>
            ))}
          </div>
        </SettingRow>

        <SettingRow label={t("settings.focus.pomodoro")} description={t("settings.focus.pomodoroDesc")}>
          <div className="flex items-center gap-4 flex-wrap">
            <label className={`flex items-center gap-1.5 text-sm ${TC.textSec}`}>
              {t("settings.focus.pomodoro.presets")}
              <input
                type="text"
                key={cfg.pomodoro.presets.join(",")}
                defaultValue={cfg.pomodoro.presets.join(", ")}
                onBlur={e => savePresets(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`w-40 border rounded px-2 py-1 text-sm outline-none focus:border-sky-500 ${TC.input} ${TC.inputText}`}
              />
            </label>
            <label className={`flex items-center gap-1.5 text-sm ${TC.textSec}`}>
              {t("settings.focus.pomodoro.breakMin")}
              <input
                type="number" min={0} max={60} value={cfg.pomodoro.breakMin}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= 0 && n <= 60) save({ pomodoro: { ...cfg.pomodoro, breakMin: n } });
                }}
                className={`w-16 border rounded px-2 py-1 text-sm outline-none focus:border-sky-500 ${TC.input} ${TC.inputText}`}
              />
            </label>
          </div>
        </SettingRow>
      </div>
    </div>
  );
}
