/**
 * @file SortBar.jsx
 * @description Sort-field toggle buttons and completion-filter control.
 *   Renders a row of pill-style buttons for each SORT_FIELDS entry and a
 *   completion-state cycle button (all / active / done).
 */

import { useApp } from "./AppContext";
import { SORT_FIELDS } from "../core/constants";

export function SortBar({ sort, onToggle }) {
  const { t, TC } = useApp();
  return (
    <div data-guide="sort-filter" className="flex items-center gap-1 flex-wrap">
      <span className={`text-xs mr-1 ${TC.textMuted}`}>{t("sort.label")}</span>
      {SORT_FIELDS.map(key => {
        const active = sort !== null && sort.field === key;
        return (
          <button key={key} onClick={() => onToggle(key)}
            style={{
              background: active ? "rgba(14,165,233,.15)" : undefined,
              color:      active ? "#7dd3fc" : undefined,
              border:     active ? "1px solid rgba(14,165,233,.35)" : undefined,
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
              ${active ? "" : `${TC.elevated} ${TC.textSec} border border-transparent`}`}
          >
            {t("sort." + key)}
            {active && <span style={{ fontSize: 10, lineHeight: 1 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
          </button>
        );
      })}
    </div>
  );
}
