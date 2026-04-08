/**
 * Application context — provides global state (locale, theme, settings) to all UI components.
 * Every component that needs t(), TC, settings, etc. consumes this via useApp().
 */
import { createContext, useContext } from "react";

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
