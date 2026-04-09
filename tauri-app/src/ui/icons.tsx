/**
 * @file icons.jsx
 * Pure SVG panel-toggle icons and theme-mode selector icons/options.
 * PanelLeftIcon / PanelRightIcon — sidebar & detail-panel toggles with active highlight.
 * AutoThemeIcon — "auto" theme glyph (hexagonal "A").
 * themeOptions — ordered list of { key, Icon } used by the theme switcher.
 */
import { Moon, Sun } from "lucide-react";

export const PanelLeftIcon = ({ size = 18, active = false }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" />
    <line x1="7" y1="2.5" x2="7" y2="17.5" />
    {active && <rect x="1.5" y="2.5" width="5.5" height="15" rx="1.5"
                     fill="currentColor" fillOpacity="0.25" stroke="none" />}
  </svg>
);

export const PanelRightIcon = ({ size = 18, active = false }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="17" height="15" rx="2.5" />
    <line x1="13" y1="2.5" x2="13" y2="17.5" />
    {active && <rect x="13" y="2.5" width="5.5" height="15" rx="1.5"
                     fill="currentColor" fillOpacity="0.25" stroke="none" />}
  </svg>
);

export const AutoThemeIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.5 2.5h7l5 5v7l-5 5h-7l-5-5v-7z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 7.5L9.2 16.5M12 7.5L14.8 16.5M10.3 13h3.4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const themeOptions = [
  { key: "auto",  Icon: AutoThemeIcon },
  { key: "dark",  Icon: Moon          },
  { key: "light", Icon: Sun           },
];
