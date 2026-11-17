/** Settings nav in the left sidebar; edits save on edit, so switching panels needs no dirty-state guard. */

import React from 'react';
import { Bell, Blocks, ChartColumn, Cpu, Settings2, Sparkles } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { platform } from '@platform/index';
import { hasIntegrations } from './IntegrationsPanel';
import { IconTile, Row, type TileGlyph } from '@shared/ui';
import { TILE_DOMAIN, type TileTint } from '@config/ui.config';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: TileGlyph;
  /** Tile hue, from the row's domain. */
  tint: TileTint;
  /** Heading of the group the row sits in on a phone's grouped Settings list. */
  group: string;
  /** False hides the section on devices without the feature; omitted means always shown. */
  available?: boolean;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Settings2, tint: TILE_DOMAIN.system, group: 'App' },
  { id: 'notifications', label: 'Notifications', icon: Bell, tint: TILE_DOMAIN.alerts, group: 'App', available: platform.hasNotifications },
  { id: 'integrations', label: 'Integrations', icon: Blocks, tint: TILE_DOMAIN.connections, group: 'App', available: hasIntegrations },
  { id: 'capabilities', label: 'Capabilities', icon: Sparkles, tint: TILE_DOMAIN.intelligence, group: 'AI' },
  { id: 'providers', label: 'Providers', icon: Cpu, tint: TILE_DOMAIN.intelligence, group: 'AI' },
  { id: 'mcp', label: 'MCP Servers', icon: SiModelcontextprotocol, tint: TILE_DOMAIN.connections, group: 'AI', available: platform.supportsChildProcessMcp },
  { id: 'usage', label: 'Usage', icon: ChartColumn, tint: TILE_DOMAIN.activity, group: 'Activity' },
];

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();

  const visibleItems = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);

  return (
    <nav aria-label="Settings sections" className="flex flex-col">
      {visibleItems.map(({ id, label, icon, tint }) => (
        <Row
          key={id}
          selected={activePanel === id}
          onClick={() => setActiveSettingsPanel(id)}
          aria-current={activePanel === id ? 'page' : undefined}
        >
          <IconTile icon={icon} tint={tint} />
          <span className="flex-1 text-left truncate">{label}</span>
        </Row>
      ))}
    </nav>
  );
};

export default SettingsNav;
