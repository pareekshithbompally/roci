/**
 * SettingsPanel Component
 *
 * Main settings view with horizontal tab bar and panel switcher.
 * Content area is overflow-hidden — each panel owns its own scroll behavior.
 * Save footer renders outside the scroll area for panels with unsaved changes.
 */

import React, { useState, useCallback } from 'react';
import { useApp } from '@shared/contexts/AppContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import { ProvidersPanel } from './ProvidersPanel';
import { ProvidersPanelErrorBoundary } from './ProvidersPanelErrorBoundary';
import { LocalInferencePanel } from './LocalInferencePanel';
import { CategoriesPanel } from './CategoriesPanel';
import { InterfacePanel } from './InterfacePanel';
import { AudioPanel } from './AudioPanel';
import { UsagePanel } from './UsagePanel';
import { SettingsSaveButton } from './SettingsSaveButton';
import { UnsavedChangesModal } from '@shared/components/UnsavedChangesModal';
import { isTauriEnvironment } from '@/services/tauri';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

type SettingsPanelType = 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface' | 'usage';

/** Panels that use explicit save (not auto-save or instant) */
const SAVEABLE_PANELS = new Set<SettingsPanelType>(['audio', 'providers', 'categories', 'interface']);

const PANEL_SAVE_NAMES: Partial<Record<SettingsPanelType, string>> = {
  audio: 'Audio settings',
  providers: 'Provider settings',
  categories: 'Workflow settings',
  interface: 'System settings',
};

const panels: Array<{ id: SettingsPanelType; label: string; tauriOnly?: boolean }> = [
  { id: 'audio', label: 'Audio' },
  { id: 'providers', label: 'Providers' },
  { id: 'local-inference', label: 'Local Inference', tauriOnly: true },
  { id: 'categories', label: 'Workflow' },
  { id: 'interface', label: 'System' },
  { id: 'usage', label: 'Usage' },
];

export const SettingsPanel: React.FC = () => {
  const { activeSettingsPanel } = useApp();
  const [activePanel, setActivePanel] = useState<SettingsPanelType>(
    panels.some(p => p.id === activeSettingsPanel) ? activeSettingsPanel as SettingsPanelType : panels[0].id
  );
  const { checkNavigation } = useUnsavedChanges();

  const handlePanelChange = useCallback((panelId: SettingsPanelType) => {
    const isBlocked = checkNavigation(() => setActivePanel(panelId));
    if (!isBlocked) {
      setActivePanel(panelId);
    }
  }, [checkNavigation]);

  const visiblePanels = panels.filter(({ tauriOnly }) => !tauriOnly || isTauriEnvironment());

  return (
    <div className="w-full h-full flex flex-col">
      <UnsavedChangesModal />

      {/* Horizontal Tab Bar — reduced top padding to sit closer to title bar */}
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

      {/* Content Area + overlaid save footer — relative container */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activePanel === 'audio' && <AudioPanel />}
        {activePanel === 'providers' && (
          <ProvidersPanelErrorBoundary>
            <ProvidersPanel />
          </ProvidersPanelErrorBoundary>
        )}
        {activePanel === 'local-inference' && <LocalInferencePanel />}
        {activePanel === 'categories' && <CategoriesPanel />}
        {activePanel === 'interface' && <InterfacePanel />}
        {activePanel === 'usage' && <UsagePanel />}

        {/* Save footer — absolutely positioned, overlays content, no layout shift.
            key={activePanel} forces remount on tab switch so savedSnapshotRef reinitializes. */}
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

export default SettingsPanel;
