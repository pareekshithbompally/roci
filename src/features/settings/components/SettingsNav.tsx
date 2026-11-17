/** Settings nav in the left sidebar; edits save on edit, so switching panels needs no dirty-state guard. */

import React from 'react';
import { Bell, Box, ChartColumn, Puzzle, Settings, Sparkles } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { platform } from '@platform/index';
import { hasIntegrations } from './IntegrationsPanel';
import { IconTile, Row, type TileGlyph } from '@shared/ui';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: TileGlyph;
  /** Tile hue, from the row's domain. */
  /** Heading of the group the row sits in on a phone's grouped Settings list. */
  group: string;
  /** False hides the section on devices without the feature; omitted means always shown. */
  available?: boolean;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Settings, group: 'App' },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'App', available: platform.hasNotifications },
  { id: 'integrations', label: 'Integrations', icon: Puzzle, group: 'App', available: hasIntegrations },
  { id: 'defaultModels', label: 'Default Models', icon: Sparkles, group: 'AI' },
  { id: 'providers', label: 'Providers', icon: Box, group: 'AI' },
  { id: 'mcp', label: 'MCP Servers', icon: SiModelcontextprotocol, group: 'AI', available: platform.hasMcp },
  { id: 'usage', label: 'Usage', icon: ChartColumn, group: 'Activity' },
];

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();

  const visibleItems = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);

  return (
    <nav aria-label="Settings sections" className="flex flex-col">
      {visibleItems.map(({ id, label, icon }) => (
        <Row
          key={id}
          selected={activePanel === id}
          onClick={() => setActiveSettingsPanel(id)}
          aria-current={activePanel === id ? 'page' : undefined}
        >
          <IconTile icon={icon} />
          <span className="flex-1 text-left truncate">{label}</span>
        </Row>
      ))}
    </nav>
  );
};

export default SettingsNav;
