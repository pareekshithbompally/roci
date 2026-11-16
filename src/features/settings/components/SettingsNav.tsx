/** Settings nav in the left sidebar; edits save on edit, so switching panels needs no dirty-state guard. */

import React from 'react';
import { Bell, Blocks, ChartColumn, Cpu, Server, Settings2, Sparkles, type LucideIcon } from 'lucide-react';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';
import { platform } from '@platform/index';
import { hasIntegrations } from './IntegrationsPanel';
import { Icon, Row } from '@shared/ui';

export interface SettingsNavItem {
  id: SettingsPanelType;
  label: string;
  icon: LucideIcon;
  /** Heading of the group the row sits in on a phone's grouped Settings list. */
  group: string;
  /** False hides the section on devices without the feature; omitted means always shown. */
  available?: boolean;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Settings2, group: 'App' },
  { id: 'capabilities', label: 'Capabilities', icon: Sparkles, group: 'App' },
  { id: 'providers', label: 'Providers', icon: Cpu, group: 'AI' },
  { id: 'integrations', label: 'Integrations', icon: Blocks, group: 'Connections', available: hasIntegrations },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'Connections', available: platform.hasNotifications },
  { id: 'mcp', label: 'MCP Servers', icon: Server, group: 'Connections', available: platform.supportsChildProcessMcp },
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
          <Icon icon={icon} size="xs" className="shrink-0" />
          <span className="flex-1 text-left truncate">{label}</span>
        </Row>
      ))}
    </nav>
  );
};

export default SettingsNav;
