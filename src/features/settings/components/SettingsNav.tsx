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
import { Blocks, ChartColumn, Cpu, Server, Settings2, Sparkles, Workflow, type LucideIcon } from 'lucide-react';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { isTauriEnvironment } from '@services/tauri';
import { Icon, Row } from '@shared/ui';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: LucideIcon;
  tauriOnly?: boolean;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'capabilities', label: 'Capabilities', icon: Sparkles },
  { id: 'providers', label: 'Providers', icon: Cpu },
  { id: 'integrations', label: 'Integrations', icon: Blocks, tauriOnly: true },
  { id: 'categories', label: 'Workflow', icon: Workflow },
  { id: 'mcp', label: 'MCP Servers', icon: Server, tauriOnly: true },
  { id: 'usage', label: 'Usage', icon: ChartColumn },
];

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();

  const visibleItems = SETTINGS_NAV_ITEMS.filter(({ tauriOnly }) => !tauriOnly || isTauriEnvironment());

  return (
    <nav aria-label="Settings sections" className="flex flex-col">
      {visibleItems.map(({ id, label, icon }) => (
        <Row
          key={id}
          selected={activePanel === id}
          onClick={() => setActiveSettingsPanel(id)}
          aria-current={activePanel === id ? 'page' : undefined}
        >
          <Icon icon={icon} size="xs" className="shrink-0" />
          <span className="flex-1 text-left truncate">{label}</span>
        </Row>
      ))}
    </nav>
  );
};

export default SettingsNav;
