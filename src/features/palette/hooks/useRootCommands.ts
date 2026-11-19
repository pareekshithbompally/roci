/** Everything the palette offers before (and beside) a search: recents, actions, places and settings — commands as data,
 *  each from the one place that owns it (sidebar items, shortcut registry, destinations, the Settings list). */

import { Circle, Moon, Settings, Square, SquarePen, Sun } from 'lucide-react';
import { useAppActions } from '@shared/stores/appStore';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { startNewChat } from '@features/chat';
import { useRecordingMeetingId, useToggleRecording } from '@features/recording';
import { SETTINGS_SECTIONS } from '@features/settings';
import { acceleratorKeys, shortcutKeys } from '@features/shortcuts';
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenSession } from '@features/history/hooks/useOpenSession';
import { useDestinations } from '@features/layout/hooks/useDestinations';
import { GLOBAL_SHORTCUTS } from '@config/shortcuts.config';
import { PALETTE_CONFIG } from '@config/palette.config';
import type { UnifiedSidebarItem } from '@shared/types';
import type { PaletteCommand } from '@features/palette/paletteTypes';
import { sessionCommand } from '@features/palette/sessionCommand';

const { groups: GROUP } = PALETTE_CONFIG;


export function useRootCommands(): PaletteCommand[] {
  const { items } = useUnifiedSidebar();
  const openSession = useOpenSession();
  const destinations = useDestinations();
  const { setCurrentView, openSettings } = useAppActions();
  const { isDark, setTheme } = useThemeContext();
  const toggleRecording = useToggleRecording();
  const recording = useRecordingMeetingId() !== null;

  const open = (item: UnifiedSidebarItem) => void openSession(item);
  const sectionCommands = SETTINGS_SECTIONS.map(({ id, label, icon, keywords }): PaletteCommand => ({
    id: `settings:${id}`, title: label, group: GROUP.settings, icon, keywords: keywords.join(' '), perform: () => openSettings(id),
  }));

  return [
    ...items.slice(0, PALETTE_CONFIG.recentCount).map((item) => sessionCommand(item, { group: GROUP.recent, open })),
    { id: 'new-chat', title: 'New Chat', group: GROUP.actions, icon: SquarePen, keywords: 'new conversation ask', keys: shortcutKeys('newChat'), perform: startNewChat },
    {
      id: 'recording',
      title: recording ? 'Stop Recording' : 'Start Recording',
      group: GROUP.actions,
      icon: recording ? Square : Circle,
      keywords: 'record meeting capture',
      keys: acceleratorKeys(GLOBAL_SHORTCUTS['toggle-recording'].accelerator),
      perform: () => { toggleRecording().catch((error: unknown) => console.error('[CommandPalette] Recording toggle failed:', error)); },
    },
    ...destinations.map(({ view, icon, label }): PaletteCommand => ({
      id: `go:${view}`, title: label, group: GROUP.navigate, icon, weight: PALETTE_CONFIG.navigateWeight, perform: () => setCurrentView(view),
    })),
    {
      id: 'theme', title: 'Toggle Theme', group: GROUP.settings, icon: isDark ? Sun : Moon, keywords: 'dark light appearance',
      perform: () => setTheme(isDark ? 'light' : 'dark'),
    },
    {
      id: 'settings',
      title: 'Settings',
      group: GROUP.settings,
      icon: Settings,
      keywords: ['preferences', ...SETTINGS_SECTIONS.flatMap((s) => [s.label, ...s.keywords])].join(' '),
      keys: shortcutKeys('openSettings'),
      children: () => sectionCommands,
    },
    // Each section also findable from the root by name or contents, once something is typed.
    ...sectionCommands.map((command) => ({ ...command, subtitle: 'Settings', hideWhenEmpty: true })),
  ];
}
