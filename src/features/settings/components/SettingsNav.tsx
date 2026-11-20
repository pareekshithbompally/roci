/** Settings nav in the left sidebar; edits save on edit, so switching panels needs no dirty-state guard. */

import React from 'react';
import { Bell, Box, ChartPie, HardDrive, Puzzle, Settings, Sparkles } from 'lucide-react';
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { platform } from '@platform/index';
import { hasIntegrations } from './IntegrationsPanel';
import { IconTile, Row, RowGroupLabel, type TileGlyph } from '@shared/ui';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: TileGlyph;
  /** Tile hue, from the row's domain. */
  /** Heading of the group the row sits in (App, AI, Data), on the Mac sidebar and the phone's Settings list. */
  group: string;
  /** False hides the section on devices without the feature; omitted means always shown. */
  available?: boolean;
  /** What the section holds, so the ⌘K palette finds it by those words too. */
  keywords: string[];
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Settings, group: 'App', keywords: ['capture', 'audio source', 'microphone', 'imports', 'theme', 'updates'] },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'App', available: platform.hasNotifications, keywords: ['meeting reminders', 'alerts'] },
  { id: 'integrations', label: 'Integrations', icon: Puzzle, group: 'App', available: hasIntegrations, keywords: ['calendar', 'reminders', 'apple notes', 'spotlight', 'hex', 'coding agents'] },
  { id: 'providers', label: 'Providers', icon: Box, group: 'AI', keywords: ['api key', 'openai', 'anthropic', 'gemini', 'local models', 'ollama'] },
  { id: 'defaultModels', label: 'Default Models', icon: Sparkles, group: 'AI', keywords: ['chat model', 'transcription', 'speech', 'summary', 'images'] },
  { id: 'mcp', label: 'MCP Servers', icon: SiModelcontextprotocol, group: 'AI', available: platform.hasMcp, keywords: ['tools', 'servers'] },
  { id: 'storage', label: 'Storage', icon: HardDrive, group: 'Data', keywords: ['disk usage', 'space', 'keep', 'retention', 'delete', 'cache', 'search index', 'finder', 'models.dev', 'catalog'] },
  { id: 'usage', label: 'Usage', icon: ChartPie, group: 'Data', keywords: ['cost', 'tokens', 'spend', 'prices', 'requests'] },
];


/** The sections this device has: what the sidebar, the phone's Settings list and the ⌘K palette all show. */
export const SETTINGS_SECTIONS = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);

/** Those sections under their group headings, in list order: the one grouping the sidebar and the phone list share. */
export const SETTINGS_GROUPS = [...new Set(SETTINGS_SECTIONS.map(({ group }) => group))].map((group) => ({
  group,
  items: SETTINGS_SECTIONS.filter((item) => item.group === group),
}));

export const SettingsNav: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();


  return (
    <nav aria-label="Settings sections" className="flex flex-col">
      {SETTINGS_GROUPS.map(({ group, items }) => (
        <React.Fragment key={group}>
          <RowGroupLabel>{group}</RowGroupLabel>
          {items.map(({ id, label, icon }) => (
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
        </React.Fragment>
      ))}
    </nav>
  );
};

export default SettingsNav;
