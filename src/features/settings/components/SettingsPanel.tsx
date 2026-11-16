/** Renders only the active settings panel; edits save on edit, so there is no save footer. */

import React, { useEffect, useState } from 'react';
import { systemInfoStore } from '@features/settings/stores/systemInfoStore';
import { useAppActions, useAppStore } from '@shared/stores/appStore';
import { useFormFactor } from '@platform/formFactor';
import { SETTINGS_NAV_ITEMS } from './SettingsNav';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { GeneralPanel } from './GeneralPanel';
import { CapabilitiesPanel } from './CapabilitiesPanel';
import { UsagePanel } from './UsagePanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { McpServersPanel } from './mcp';
import { Card, CardRow, Icon, PushScreen, Surface } from '@shared/ui';
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

/** Phone: Settings is a grouped list, one row per section; a row pushes that section's panel. */
const PhoneSettings: React.FC<{ activePanel: SettingsPanelType }> = ({ activePanel }) => {
  const { setActiveSettingsPanel } = useAppActions();
  const [pushed, setPushed] = useState(false);
  const items = SETTINGS_NAV_ITEMS.filter(({ available }) => available !== false);
  const open = (id: SettingsPanelType) => {
    setActiveSettingsPanel(id);
    setPushed(true);
  };

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto p-4">
        <Card>
          {items.map(({ id, label, icon }) => (
            <CardRow key={id} title={label} leading={<Icon icon={icon} size="sm" />} onOpen={() => open(id)} />
          ))}
        </Card>
      </div>
      <PushScreen
        open={pushed}
        title={items.find(({ id }) => id === activePanel)?.label}
        backLabel="Settings"
        onBack={() => setPushed(false)}
      >
        {pushed && <PanelView id={activePanel} />}
      </PushScreen>
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { isLoading } = useSettings();
  const formFactor = useFormFactor();

  // System panel data (paths, disk, index) loads while the user is still on another panel.
  useEffect(() => systemInfoStore.preload(), []);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col">
        <SettingsSkeleton />
      </div>
    );
  }

  if (formFactor === 'phone') return <PhoneSettings activePanel={activePanel} />;

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
