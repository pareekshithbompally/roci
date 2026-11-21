/** Renders only the active settings panel; edits save on edit, so there is no save footer. */

import React, { useEffect } from 'react';
import { preloadSystemInfo } from '@features/settings/hooks/useSystemInfo';
import { useAppStore, useSettingsVisit } from '@shared/stores/appStore';
import { SETTINGS_GROUPS, SETTINGS_NAV_ITEMS, usePaneArt } from './SettingsNav';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { GeneralPanel } from './GeneralPanel';
import { StoragePanel } from './StoragePanel';
import { DefaultModelsPanel } from './DefaultModelsPanel';
import { preloadUsage, UsagePanel } from '@features/usage';
import { PersonalizationPanel } from '@features/personalization';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { McpServersPanel } from './mcp';
import { CardRow, IconTile, Section, useNavStack } from '@shared/ui';
import { LoadingPane } from '@shared/components';
import type { NavScreen } from '@shared/ui';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';

const PANEL_COMPONENTS: Record<SettingsPanelType, React.FC> = {
  general: GeneralPanel,
  storage: StoragePanel,
  defaultModels: DefaultModelsPanel,
  personalization: PersonalizationPanel,
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
  const art = usePaneArt();
  // System and Usage data load while the user is still on this list, as on the desktop, so those panels land with it.
  useEffect(() => {
    preloadSystemInfo();
    preloadUsage();
  }, []);
  return (
    <div className="flex flex-col gap-section p-4">
      {SETTINGS_GROUPS.map(({ group, items }) => (
        <Section key={group} title={group}>
          {items.map(({ id, label }) => (
            <CardRow key={id} title={label} leading={<IconTile image={art(id)} />} onOpen={() => push(settingsScreen(id))} />
          ))}
        </Section>
      ))}
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const visit = useSettingsVisit();
  const { isLoading } = useSettings();

  // System and Usage data load while the user is still on another panel, so those panels land with it.
  useEffect(() => {
    preloadSystemInfo();
    preloadUsage();
  }, []);

  if (isLoading) return <LoadingPane />;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden relative h-full">
        {/* Keyed by the visit: each way into a panel starts it again at its top (and at a requested page). */}
        <PanelView key={visit} id={activePanel} />
      </div>
    </div>
  );
};

export default SettingsPanel;
