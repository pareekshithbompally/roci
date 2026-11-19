/** Settings you change in one step, without opening Settings: what ⌘K keeps at the bottom of its list. One entry each. */

import { Moon, Settings, Sun } from 'lucide-react';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useAppActions } from '@shared/stores/appStore';
import type { TileGlyph } from '@shared/ui';

export interface QuickSetting {
  id: string;
  label: string;
  icon: TileGlyph;
  /** Words it is found by, beside its label. */
  keywords: string[];
  run: () => void;
}

export function useQuickSettings(): QuickSetting[] {
  const { isDark, setTheme } = useThemeContext();
  const { openSettings } = useAppActions();
  return [
    {
      id: 'appearance',
      label: isDark ? 'Switch to Light Appearance' : 'Switch to Dark Appearance',
      icon: isDark ? Sun : Moon,
      keywords: ['appearance', 'theme', 'dark mode', 'light mode'],
      run: () => setTheme(isDark ? 'light' : 'dark'),
    },
    { id: 'settings', label: 'Open Settings', icon: Settings, keywords: ['preferences'], run: () => openSettings() },
  ];
}
