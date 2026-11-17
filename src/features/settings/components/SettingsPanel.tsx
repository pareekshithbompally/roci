/** Renders only the active settings panel; edits save on edit, so there is no save footer. */

import React, { useEffect } from 'react';
import { systemInfoStore } from '@features/settings/stores/systemInfoStore';
import { useAppStore } from '@shared/stores/appStore';
import { SETTINGS_NAV_ITEMS } from './SettingsNav';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { GeneralPanel } from './GeneralPanel';
import { CapabilitiesPanel } from './CapabilitiesPanel';
import { UsagePanel } from '@features/usage';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { McpServersPanel } from './mcp';
import { CardRow, IconTile, Section, Surface, useNavStack } from '@shared/ui';
import type { NavScreen } from '@shared/ui';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';

const PANEL_COMPONENTS: Record<SettingsPanelType, React.FC> = {
  general: GeneralPanel,
  capabilities: CapabilitiesPanel,
  providers: ProvidersPanel,
  integrations: IntegrationsPanel,
  notifications: NotificationsPanel,
  mcp: McpServersPanel,
  usage: UsagePanel,
};

const PanelView: React.FC<{ id: SettingsPanelType }> = ({ id }) =>
  id === 'providers' ? (
    <ProvidersPanelErrorBoundary>
      <ProvidersPanel />
    </ProvidersPanelErrorBoundary>
  ) : (
    React.createElement(PANEL_COMPONENTS[id])
  );

/** A settings panel as a phone navigation screen (its row's label as the title). */
export function settingsScreen(id: SettingsPanelType): NavScreen {
  const label = SETTINGS_NAV_ITEMS.find((item) => item.id === id)?.label ?? '';
  return { title: label, content: <PanelView id={id} /> };
}

/** Phone: the root of the Settings sheet — sections grouped under headings; a row pushes its panel. */
export const SettingsHome: React.FC = () => {
  const { push } = useNavStack();
  const items = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);
  const groups = [...new Set(items.map(({ group }) => group))];

  return (
    <div className="flex flex-col gap-6 p-4">
      {groups.map((group) => (
        <Section key={group} title={group}>
          {items.filter((item) => item.group === group).map(({ id, label, icon, tint }) => (
            <CardRow key={id} title={label} leading={<IconTile icon={icon} tint={tint} />} leadingAlign="row" onOpen={() => push(settingsScreen(id))} />
          ))}
        </Section>
      ))}
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { isLoading } = useSettings();

  // System panel data (paths, disk, index) loads while the user is still on another panel.
  useEffect(() => systemInfoStore.preload(), []);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col">
        <SettingsSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden relative h-full">
        <PanelView id={activePanel} />
      </div>
    </div>
  );
};

/** Simple skeleton while settings load from disk */
const SettingsSkeleton: React.FC = () => (
  <div className="h-full overflow-hidden">
    <div className="px-8 py-8 space-y-8 animate-pulse">
      <div className="space-y-2">
        <Surface variant="inset" radius="md" className="h-5 w-40" />
        <Surface variant="subtle" radius="md" className="h-3.5 w-64" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Surface variant="inset" radius="md" className="h-3 w-24" />
          <Surface variant="subtle" radius="lg" className="h-10 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export default SettingsPanel;
