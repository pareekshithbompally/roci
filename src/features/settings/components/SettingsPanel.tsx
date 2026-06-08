/**
 * SettingsPanel Component
 *
 * Main settings view with horizontal tab bar and panel switcher.
 * All panels stay mounted (CSS visibility) to avoid data re-fetching
 * on tab switches. Save footer overlays the content area.
 */

import React, { useCallback } from 'react';
import { useAppStore, useAppActions } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { LocalInferencePanel } from './LocalInferencePanel';
import { CategoriesPanel } from './CategoriesPanel';
import { InterfacePanel } from './InterfacePanel';
import { AudioPanel } from './AudioPanel';
import { UsagePanel } from './UsagePanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { SettingsSaveButton } from './SettingsSaveButton';
import { UnsavedChangesModal } from '@shared/components/UnsavedChangesModal';
import { isTauriEnvironment } from '@services/tauri';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import type { SettingsPanel as SettingsPanelType } from '@shared/stores/appStore';

/** Panels that use explicit save (not auto-save or instant) */
const SAVEABLE_PANELS = new Set<SettingsPanelType>(['audio', 'providers', 'categories', 'integrations', 'interface']);

const PANEL_SAVE_NAMES: Partial<Record<SettingsPanelType, string>> = {
  audio: 'Audio settings',
  providers: 'Provider settings',
  categories: 'Workflow settings',
  integrations: 'Integration settings',
  interface: 'System settings',
};

const panels: Array<{ id: SettingsPanelType; label: string; tauriOnly?: boolean }> = [
  { id: 'audio', label: 'Audio' },
  { id: 'providers', label: 'Providers' },
  { id: 'local-inference', label: 'Local Inference', tauriOnly: true },
  { id: 'categories', label: 'Workflow' },
  { id: 'integrations', label: 'Integrations', tauriOnly: true },
  { id: 'usage', label: 'Usage' },
  { id: 'interface', label: 'System' },
];

export const SettingsPanel: React.FC = () => {
  const activePanel = useAppStore((s) => s.activeSettingsPanel);
  const { setActiveSettingsPanel } = useAppActions();
  const { checkNavigation } = useUnsavedChanges();
  const { isLoading } = useSettings();

  const handlePanelChange = useCallback((panelId: SettingsPanelType) => {
    const isBlocked = checkNavigation(() => setActiveSettingsPanel(panelId));
    if (!isBlocked) {
      setActiveSettingsPanel(panelId);
    }
  }, [checkNavigation, setActiveSettingsPanel]);

  const visiblePanels = panels.filter(({ tauriOnly }) => !tauriOnly || isTauriEnvironment());

  return (
    <div className="w-full h-full flex flex-col">
      <UnsavedChangesModal />

      {/* Horizontal Tab Bar */}
      <div className={`border-b ${BORDER.default} px-6 md:px-8 pt-1 shrink-0`}>
        <div className="flex gap-1 -mb-px">
          {visiblePanels.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handlePanelChange(id)}
              className={`flex items-center px-3 py-2.5 ${TYPOGRAPHY_CLASSES.settingsButton} border-b-2 transition-colors ${
                activePanel === id
                  ? COMPONENT.tabActive
                  : COMPONENT.tabDefault
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area — all panels kept mounted, hidden via display:none */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {isLoading ? (
          <SettingsSkeleton />
        ) : (
          <>
            <PanelWrapper visible={activePanel === 'audio'}>
              <AudioPanel />
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'providers'}>
              <ProvidersPanelErrorBoundary>
                <ProvidersPanel />
              </ProvidersPanelErrorBoundary>
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'local-inference'}>
              <LocalInferencePanel />
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'categories'}>
              <CategoriesPanel />
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'integrations'}>
              <IntegrationsPanel />
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'interface'}>
              <InterfacePanel />
            </PanelWrapper>
            <PanelWrapper visible={activePanel === 'usage'}>
              <UsagePanel />
            </PanelWrapper>
          </>
        )}

        {/* Save footer — overlays bottom of content. key={activePanel} forces
            remount so the snapshot ref reinitializes for dirty tracking. */}
        {SAVEABLE_PANELS.has(activePanel) && (
          <SettingsSaveFooter
            key={activePanel}
            panelId={activePanel}
            panelName={PANEL_SAVE_NAMES[activePanel]!}
          />
        )}
      </div>
    </div>
  );
};

/** Keeps children mounted but toggles visibility — prevents data refetch on tab switch */
const PanelWrapper: React.FC<{ visible: boolean; children: React.ReactNode }> = ({ visible, children }) => (
  <div style={{ display: visible ? 'block' : 'none' }} className="h-full">
    {children}
  </div>
);

/** Reads unsaved state and renders save button in the fixed footer */
const SettingsSaveFooter: React.FC<{ panelName: string; panelId: string }> = ({ panelName, panelId }) => {
  const { isSaving, hasUnsavedChanges, save } = useSettingsSave(panelName, panelId);

  return (
    <SettingsSaveButton
      isSaving={isSaving}
      hasUnsavedChanges={hasUnsavedChanges}
      onSave={save}
    />
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
