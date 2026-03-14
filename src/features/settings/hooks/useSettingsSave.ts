/**
 * useSettingsSave Hook
 *
 * Unifies save behavior across settings panels.
 * Wraps saveSettings + toast + dirty-state clearing in one call.
 */

import { useState, useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';

export function useSettingsSave(panelName: string) {
  const { saveSettings } = useSettings();
  const { showToast } = useToast();
  const { hasUnsavedChanges, clearUnsavedChanges } = useUnsavedChanges();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveSettings();
      clearUnsavedChanges();
      showToast(`${panelName} saved successfully`, 'success');
    } catch (error) {
      console.error(`[${panelName}] Failed to save:`, error);
      showToast(`Failed to save ${panelName.toLowerCase()}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [saveSettings, clearUnsavedChanges, showToast, panelName]);

  return { isSaving, hasUnsavedChanges, save };
}
