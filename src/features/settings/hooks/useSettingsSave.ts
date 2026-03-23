/**
 * useSettingsSave Hook
 *
 * Value-based dirty tracking: snapshots settings+providers on mount and after save,
 * derives hasUnsavedChanges by comparing current state vs snapshot.
 * No manual setHasUnsavedChanges(true) calls needed — panels just call setSettings()
 * and dirty state is derived automatically.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';
import type { AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';

/** Stable serialization for comparison — ignores key ordering */
function stableStringify(value: unknown): string {
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortKeys);
    }
    const sortedObj: Record<string, any> = {};
    Object.keys(obj).sort().forEach(key => {
      sortedObj[key] = sortKeys(obj[key as keyof typeof obj]);
    });
    return sortedObj;
  };
  return JSON.stringify(sortKeys(value));
}

/** Build a snapshot string from the settings/providers relevant to a panel */
function buildSnapshot(panelId: string, settings: AppSettings, providers: ModelProvider[]): string {
  switch (panelId) {
    case 'audio':
      return stableStringify({
        defaultAudioSource: settings.defaultAudioSource,
        audioQualityPreset: settings.audioQualityPreset,
        transcriptionModel: settings.transcriptionModel,
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
        summaryExtraction: settings.summaryExtraction,
        meetingDefaults: settings.meetingDefaults,
      });
    case 'interface':
      return stableStringify({
        jobProcessing: settings.jobProcessing,
      });
    default:
      return stableStringify(settings);
  }
}

export function useSettingsSave(panelName: string, panelId?: string) {
  const { settings, providers, saveSettings, isLoading } = useSettings();
  const { showToast } = useToast();
  const { setHasUnsavedChanges, clearUnsavedChanges } = useUnsavedChanges();
  const [isSaving, setIsSaving] = useState(false);

  // Derive panelId from panelName if not provided
  const resolvedPanelId = panelId || panelName.toLowerCase().replace(/\s+settings?$/i, '');

  // null = not yet initialized (waiting for settings to finish loading)
  const savedSnapshotRef = useRef<string | null>(null);
  // Tracks whether the initial snapshot has been captured after load
  const isReadyRef = useRef(false);

  // Capture the baseline snapshot once — only after settings have loaded.
  // Runs inline during render (ref mutation is safe here: idempotent, no side effects).
  if (!isLoading && !isReadyRef.current) {
    isReadyRef.current = true;
    savedSnapshotRef.current = buildSnapshot(resolvedPanelId, settings, providers);
  }

  // Only compare once the baseline is established; always false while loading.
  const currentSnapshot = isReadyRef.current
    ? buildSnapshot(resolvedPanelId, settings, providers)
    : null;
  const hasUnsavedChanges = currentSnapshot !== null && currentSnapshot !== savedSnapshotRef.current;

  // Sync dirty state to navigation-guard context
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges, resolvedPanelId);
  }, [hasUnsavedChanges, resolvedPanelId, setHasUnsavedChanges]);

  // Clear stale dirty state when this panel unmounts (e.g. settings closed, tab switched)
  useEffect(() => {
    return () => { clearUnsavedChanges(); };
  }, [clearUnsavedChanges]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveSettings();
      // Advance baseline to current state so dirty resets to false
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
