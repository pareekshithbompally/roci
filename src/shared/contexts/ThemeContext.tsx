/** Global light/dark/system theme. */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  /** Current theme setting */
  theme: Theme;
  /** Set theme */
  setTheme: (theme: Theme) => void;
  /** Is dark mode currently active */
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Default theme */
  defaultTheme?: Theme;
  /** Storage key for persisting theme */
  storageKey?: string;
}

/** Match the native window's appearance to the app theme so AppKit chrome agrees; 'system' defers to macOS. */
function syncNativeWindowTheme(theme: Theme): void {
  if (!platform.hasWindowChrome || !isTauriEnvironment()) return;
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === 'system' ? null : theme))
    .catch((error: unknown) => console.error('[ThemeContext] Failed to set window theme:', error));
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
  storageKey = 'theme',
}) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [isDark, setIsDark] = useState(false);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(storageKey, newTheme);
  };

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.classList.add(effectiveTheme);
    setIsDark(effectiveTheme === 'dark');
    syncNativeWindowTheme(theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(mediaQuery.matches ? 'dark' : 'light');
        setIsDark(mediaQuery.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
