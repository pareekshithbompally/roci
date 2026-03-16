/**
 * useSettingsSave Hook
 *
 * Value-based dirty tracking: snapshots settings+providers on mount and after save,
 * derives hasUnsavedChanges by comparing current state vs snapshot.
 * No manual setHasUnsavedChanges(true) calls needed — panels just call setSettings()
 * and dirty state is derived automatically.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import type { AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';

/** Stable serialization for comparison — ignores key ordering */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

/** Build a snapshot string from the settings/providers relevant to a panel */
function buildSnapshot(panelId: string, settings: AppSettings, providers: ModelProvider[]): string {
  switch (panelId) {
    case 'audio':
      return stableStringify({
        defaultAudioSource: settings.defaultAudioSource,
        audioQualityPreset: settings.audioQualityPreset,
        transcriptionModel: settings.transcriptionModel,
        jobProcessing: settings.jobProcessing,
      });
    case 'providers':
      return stableStringify({
        providers: providers.map(p => ({
          provider: p.provider,
          active: p.active,
          models: p.models,
          settings: p.settings,
        })),
      });
    case 'categories':
      return stableStringify({
        categories: settings.categories,
      });
    default:
      return stableStringify(settings);
  }
}

export function useSettingsSave(panelName: string, panelId?: string) {
  const { settings, providers, saveSettings } = useSettings();
  const { showToast } = useToast();
  const { setHasUnsavedChanges, clearUnsavedChanges } = useUnsavedChanges();
  const [isSaving, setIsSaving] = useState(false);

  // Derive panelId from panelName if not provided
  const resolvedPanelId = panelId || panelName.toLowerCase().replace(/\s+settings?$/i, '');

  // Snapshot of last-saved state — initialized on first render, updated after save
  const savedSnapshotRef = useRef<string>(buildSnapshot(resolvedPanelId, settings, providers));

  // Compare current state to saved snapshot
  const currentSnapshot = buildSnapshot(resolvedPanelId, settings, providers);
  const hasUnsavedChanges = currentSnapshot !== savedSnapshotRef.current;

  // Keep the context in sync so navigation guards and the save footer work
  useMemo(() => {
    setHasUnsavedChanges(hasUnsavedChanges, resolvedPanelId);
  }, [hasUnsavedChanges, resolvedPanelId, setHasUnsavedChanges]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveSettings();
      // Update snapshot to current state
      savedSnapshotRef.current = buildSnapshot(resolvedPanelId, settings, providers);
      clearUnsavedChanges();
      showToast(`${panelName} saved successfully`, 'success');
    } catch (error) {
      console.error(`[${panelName}] Failed to save:`, error);
      showToast(`Failed to save ${panelName.toLowerCase()}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [saveSettings, clearUnsavedChanges, showToast, panelName, resolvedPanelId, settings, providers]);

  return { isSaving, hasUnsavedChanges, save };
}
