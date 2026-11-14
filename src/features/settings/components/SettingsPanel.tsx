/**
 * SettingsPanel Component
 *
 * Main settings view — renders the active settings panel selected from the
 * left sidebar (`SettingsNav`). Only the active panel is mounted.
 *
 * Edits save on edit (debounced write-through in SettingsContext), so there
 * is no tab bar here, no dirty tracking, and no save footer.
 */

import React, { useEffect } from 'react';
import { systemInfoStore } from '@features/settings/stores/systemInfoStore';
import { useAppStore } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { CategoriesPanel } from './CategoriesPanel';
import { GeneralPanel } from './GeneralPanel';
import { CapabilitiesPanel } from './CapabilitiesPanel';
import { UsagePanel } from './UsagePanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { McpServersPanel } from './mcp';
import { Surface } from '@shared/ui';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';

const PANEL_COMPONENTS: Record<SettingsPanelType, React.FC> = {
  general: GeneralPanel,
  capabilities: CapabilitiesPanel,
  providers: ProvidersPanel,
  categories: CategoriesPanel,
  integrations: IntegrationsPanel,
  mcp: McpServersPanel,
  usage: UsagePanel,
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

  const ActivePanel =
    activePanel === 'providers' ? (
      <ProvidersPanelErrorBoundary>
        <ProvidersPanel />
      </ProvidersPanelErrorBoundary>
    ) : (
      React.createElement(PANEL_COMPONENTS[activePanel])
    );

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden relative h-full">
        {ActivePanel}
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
