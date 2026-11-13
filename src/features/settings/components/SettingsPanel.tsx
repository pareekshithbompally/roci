/**
 * SettingsPanel Component
 *
 * Main settings view — renders the active settings panel selected from the
 * left sidebar (`SettingsNav`). Only the active panel is mounted.
 *
 * Edits save on edit (debounced write-through in SettingsContext), so there
 * is no tab bar here, no dirty tracking, and no save footer.
 */

import React from 'react';
import { useAppStore } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { CategoriesPanel } from './CategoriesPanel';
import { InterfacePanel } from './InterfacePanel';
import { AudioPanel } from './AudioPanel';
import { UsagePanel } from './UsagePanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';

const PANEL_COMPONENTS: Record<SettingsPanelType, React.FC> = {
  audio: AudioPanel,
  providers: ProvidersPanel,
  categories: CategoriesPanel,
  integrations: IntegrationsPanel,
  interface: InterfacePanel,
  usage: UsagePanel,
};

export const SettingsPanel: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { isLoading } = useSettings();

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
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-3.5 w-64 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
      </div>
      {/* Content rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="h-3 w-24 bg-zinc-200/60 dark:bg-zinc-800/60 rounded" />
          <div className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/30 rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);

export default SettingsPanel;
