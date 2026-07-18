import { createContext, useContext, useEffect, useState } from "react";
import type { Theme } from "./types";
import { applyTheme } from "./applyTheme";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

const themeModules = import.meta.glob<{ default: Theme }>(
  "./**/theme.json",
  { eager: true }
);

export const builtinThemes: Theme[] = Object.values(themeModules).map(
  (m) => m.default
);

function resolveDefaultTheme(): Theme {
  const saved = getRuntimeState().theme;
  if (saved) {
    const match = builtinThemes.find((t) => t.name === saved);
    if (match) return match;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const fallbackName = prefersDark ? "Tempest Dark" : "Tempest Light";
  return builtinThemes.find((t) => t.name === fallbackName) ?? builtinThemes[0];
}

interface ThemeContextValue {
  theme: Theme;
  themes: Theme[];
  setTheme: (theme: Theme) => void;
  loadThemeFromJson: (json: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveDefaultTheme);

  function setTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
    setRuntimeState({ theme: t.name });
  }

  function loadThemeFromJson(json: string) {
    try {
      const parsed = JSON.parse(json) as Theme;
      if (!parsed.name || !parsed.colors) throw new Error("Invalid theme file");
      setTheme(parsed);
    } catch (e) {
      console.error("Failed to load theme:", e);
    }
  }

  useEffect(() => {
    applyTheme(theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themes: builtinThemes, setTheme, loadThemeFromJson }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
