import { createContext, useContext, useState, useMemo } from 'react';
import dark from './tempest-dark/theme.json';
import light from './tempest-light/theme.json';

const themes = { dark, light };

const ThemeContext = createContext({
  mode: 'dark',
  colors: dark.colors,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children, initial = 'dark' }) {
  const [mode, setMode] = useState(initial);
  const value = useMemo(
    () => ({
      mode,
      colors: themes[mode].colors,
      setMode,
      toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
    }),
    [mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
