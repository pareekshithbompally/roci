/**
 * SettingsPanel Component
 *
 * Main settings view with horizontal tab bar and panel switcher.
 * Pure routing — no panel-specific state lives here.
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
import { UnsavedChangesModal } from '@shared/components/UnsavedChangesModal';
import { isTauriEnvironment } from '@/services/tauri';
import { BORDER, TEXT, COMPONENT } from '@config/theme.config';

type SettingsPanelType = 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface';

const panels: Array<{ id: SettingsPanelType; label: string; tauriOnly?: boolean }> = [
  { id: 'audio', label: 'Audio' },
  { id: 'providers', label: 'Providers' },
  { id: 'local-inference', label: 'Local Inference', tauriOnly: true },
  { id: 'categories', label: 'Categories' },
  { id: 'interface', label: 'Interface' },
];

export const SettingsPanel: React.FC = () => {
  const { activeSettingsPanel } = useApp();
  const [activePanel, setActivePanel] = useState<SettingsPanelType>(
    // Use context value if it maps to a valid panel, otherwise default to first panel
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

      {/* Horizontal Tab Bar */}
      <div className={`border-b ${BORDER.default} px-6 md:px-8 shrink-0`}>
        <div className="flex gap-1 -mb-px">
          {visiblePanels.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handlePanelChange(id)}
              className={`flex items-center px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className={`${activePanel === 'providers' || activePanel === 'local-inference' ? 'max-w-5xl' : 'max-w-2xl'} mx-auto p-6 md:p-8`}>
          {activePanel === 'audio' && <AudioPanel />}
          {activePanel === 'providers' && (
            <ProvidersPanelErrorBoundary>
              <ProvidersPanel />
            </ProvidersPanelErrorBoundary>
          )}
          {activePanel === 'local-inference' && <LocalInferencePanel />}
          {activePanel === 'categories' && <CategoriesPanel />}
          {activePanel === 'interface' && <InterfacePanel />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
