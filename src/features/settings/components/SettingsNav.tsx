/**
 * SettingsNav Component
 *
 * Vertical settings navigation rendered inside the left sidebar when the app
 * is in the settings view. Clicking an entry switches `activeSettingsPanel`,
 * which the main content area (`SettingsPanel`) renders.
 *
 * Edits save on edit (debounced write-through in SettingsContext), so
 * switching entries is always safe — no navigation guard, no dirty state.
 */

import React from 'react';
import {
  Mic,
  KeyRound,
  Cpu,
  Workflow,
  Blocks,
  BarChart3,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { isTauriEnvironment } from '@services/tauri';
import { TEXT, SURFACE } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: LucideIcon;
  tauriOnly?: boolean;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'providers', label: 'Providers', icon: KeyRound },
  { id: 'local-inference', label: 'Local Inference', icon: Cpu, tauriOnly: true },
  { id: 'categories', label: 'Workflow', icon: Workflow },
  { id: 'integrations', label: 'Integrations', icon: Blocks, tauriOnly: true },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'interface', label: 'System', icon: SlidersHorizontal },
];

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();

  const visibleItems = SETTINGS_NAV_ITEMS.filter(({ tauriOnly }) => !tauriOnly || isTauriEnvironment());

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-0.5 px-2 py-1">
      {visibleItems.map(({ id, label, icon: Icon }) => {
        const isActive = activePanel === id;
        return (
          <button
            key={id}
            onClick={() => setActiveSettingsPanel(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md ${TYPOGRAPHY_CLASSES.sidebarItem} transition-all cursor-pointer ${
              isActive
                ? `${SURFACE.selected} ${TEXT.primary}`
                : `${TEXT.muted} ${SURFACE.hoverSubtle}`
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left">{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default SettingsNav;
