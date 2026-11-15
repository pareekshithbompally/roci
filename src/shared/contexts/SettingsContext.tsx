/**
 * Settings Context
 *
 * Manages application settings and model providers.
 * Reads/writes via the unified store (Phase 4).
 *
 * Key features:
 * - Persists settings as key-value pairs in kasset.db
 * - Merges saved providers with predefined providers (for new providers added in updates)
 * - Loads settings on mount
 * - Save-on-edit: every mutation auto-persists after a short debounce;
 *   `saveSettings` remains as an immediate flush. No dirty tracking.
 */

import { DEFAULT_NOTIFICATION_SETTINGS } from '@config/notifications.config';
import React, { createContext, useContext, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { store } from '@services/db';
import { predefinedProviders, MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import { withSummaryModels } from '@shared/utils/modelResolver';
import { defaultSpeechSelection } from '@services/ai/transcription';
import { queryKeys } from '@shared/query/queryKeys';

interface SettingsState {
  /** App settings */
  settings: AppSettings;
  /** Model providers */
  providers: ModelProvider[];
  /** Currently selected provider name */
  selectedProviderName: string | null;
  /** Loading state */
  isLoading: boolean;
}

interface SettingsContextValue extends SettingsState {
  /** Get selected provider */
  selectedProvider: ModelProvider | undefined;
  /** Set app settings */
  setSettings: (settings: Partial<AppSettings>) => void;
  /** Set model providers */
  setProviders: (providers: ModelProvider[]) => void;
  /** Add a provider */
  addProvider: (provider: ModelProvider) => void;
  /** Update a provider */
  updateProvider: (providerName: string, updates: Partial<ModelProvider>) => void;
  /** Delete a provider */
  deleteProvider: (providerName: string) => void;
  /** Update provider setting */
  updateProviderSetting: (providerName: string, settingIndex: number, value: string | boolean | number) => void;
  /** Set selected provider */
  setSelectedProviderName: (name: string | null) => void;
  /** Load settings from storage */
  loadSettings: () => Promise<void>;
  /** Save settings to storage */
  saveSettings: (overrides?: Partial<AppSettings>) => Promise<void>;
}

export const defaultSettings: AppSettings = {
  transcriptionModel: '',
  chatModel: '',
  analyzeModel: '',
  apiKey: '',
  defaultAudioSource: 'systemAndMicrophone',
  jobProcessing: { mode: 'sequential', maxConcurrent: 2 },
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

const SETTINGS_KEYS: Array<keyof AppSettings> = [
  'transcriptionProvider', 'transcriptionModel', 'chatModel', 'analyzeModel', 'kgExtractionModel',
  'apiKey', 'defaultAudioSource',
  'jobProcessing', 'calendarIntegration', 'notifications', 'readAloudEngine', 'readAloudVoice', 'remindersIntegration', 'hexIntegration', 'appleIntelligenceIntegration', 'appleNotesIntegration', 'showModelAvatars', 'hideToolCalls', 'liveTranscription',
];

/**
 * Save-on-edit delay. Every settings mutation writes through to disk after
 * this trailing debounce so rapid edits (typing an API key, toggling a list)
 * coalesce into a single write. Matches the debounced-settings pattern used
 * by Jan; Hex persists every mutation immediately at the model layer.
 */
const AUTOSAVE_DELAY_MS = 500;

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
}

function mergeProviders(savedProviders: ModelProvider[], predefined: ModelProvider[]): ModelProvider[] {
  const merged: ModelProvider[] = [];
  const savedProviderMap = new Map(savedProviders.map(p => [p.provider, p]));

  for (const predefinedProvider of predefined) {
    const savedProvider = savedProviderMap.get(predefinedProvider.provider);
    if (savedProvider) {
      merged.push(savedProvider);
      savedProviderMap.delete(predefinedProvider.provider);
    } else {
      merged.push({ ...predefinedProvider });
    }
  }

  for (const [, customProvider] of savedProviderMap) {
    merged.push(customProvider);
  }

  return merged.map(provider => {
    if (!MANAGED_SDK_PROVIDERS.has(provider.provider)) return provider;
    const hasStaleBaseUrl = provider.settings.some(s => s.key === 'base-url');
    if (!hasStaleBaseUrl) return provider;
    return {
      ...provider,
      settings: provider.settings.filter(s => s.key !== 'base-url'),
      base_url: '',
    };
  });
}

function hasApiKey(provider: ModelProvider): boolean {
  if (provider.api_key && typeof provider.api_key === 'string' && provider.api_key.trim() !== '') {
    return true;
  }
  const apiKeySetting = provider.settings?.find((s) => s.key === 'api-key');
  const value = apiKeySetting?.controller_props?.value;
  return typeof value === 'string' && value.trim() !== '';
}

async function loadSettingsFromStore(): Promise<{ settings: AppSettings; selectedProviderName: string | null }> {
  const raw = await store.settings.getAll();
  const loaded: Partial<AppSettings> = {};

  for (const key of SETTINGS_KEYS) {
    if (raw[key]) {
      try {
        (loaded as any)[key] = JSON.parse(raw[key]);
      } catch {
        (loaded as any)[key] = raw[key];
      }
    }
  }

  let spn: string | null = null;
  try { spn = raw.selectedProviderName ? JSON.parse(raw.selectedProviderName) : null; } catch { spn = raw.selectedProviderName ?? null; }

  return { settings: { ...defaultSettings, ...loaded }, selectedProviderName: spn };
}


/** Loaded snapshot owned by the settings query. Mutations update it optimistically. */
interface LoadedSettings {
  settings: AppSettings;
  providers: ModelProvider[];
  selectedProviderName: string | null;
}

const FALLBACK_SETTINGS: LoadedSettings = {
  settings: defaultSettings,
  providers: [],
  selectedProviderName: null,
};

/**
 * Provider ids removed from the app. Saved configs with these ids are
 * deleted on load so retired providers never reappear in the UI.
 */
const RETIRED_PROVIDER_IDS = new Set(['azure', 'cohere', 'huggingface', 'xai', 'local:llamacpp']);

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data: loaded = FALLBACK_SETTINGS, isLoading } = useQuery({
    queryKey: queryKeys.storeSettings(),
    queryFn: loadAllSettings,
  });

  const selectedProvider = loaded.providers.find(
    p => p.provider === loaded.selectedProviderName
  );

  /**
   * Load the full settings snapshot. Runs as the settings query function on
   * mount (and on explicit invalidation) — no manual effect needed.
   */
  async function loadAllSettings(): Promise<LoadedSettings> {
    console.log('[SettingsContext] Loading settings...');

    try {
      await store.initialize();
      const { settings: loadedSettings, selectedProviderName: savedProviderName } = await loadSettingsFromStore();

      let loadedProviders: ModelProvider[];
      let selectedProviderName: string | null = savedProviderName;

      const savedProviders = await store.providers.list();

      // Retired providers (removed from the app) must never reappear:
      // drop them from disk and from this load.
      const liveProviders = savedProviders.filter((p) => !RETIRED_PROVIDER_IDS.has(p.provider));
      const retired = savedProviders.filter((p) => RETIRED_PROVIDER_IDS.has(p.provider));
      if (retired.length > 0) {
        console.log('[SettingsContext] Removing retired providers:', retired.map((p) => p.provider));
        await Promise.allSettled(retired.map((p) => store.providers.delete(p.provider)));
      }

      if (liveProviders.length > 0) {
        console.log('[SettingsContext] Using saved providers, count:', liveProviders.length);
        loadedProviders = mergeProviders(liveProviders, predefinedProviders);
      } else {
        console.log('[SettingsContext] No saved providers, using predefined');
        loadedProviders = predefinedProviders.map(p => ({ ...p }));
      }

      // Drop selections pointing at providers that no longer exist so the
      // auto-select below picks something that works.
      if (selectedProviderName && !loadedProviders.some((p) => p.provider === selectedProviderName)) {
        console.log('[SettingsContext] Clearing dangling selected provider:', selectedProviderName);
        selectedProviderName = null;
      }
      const servedBy = (sources: typeof loadedProviders, id: string) => sources.some((p) => p.models?.some((m) => m.id === id));
      const modelServed = (id: string) => servedBy(loadedProviders, id);
      // The summary model may also come from an integration (Apple Intelligence).
      const summaryServed = (id: string) => servedBy(withSummaryModels(loadedProviders, loadedSettings), id);
      if (loadedSettings.chatModel && !modelServed(loadedSettings.chatModel)) {
        console.log('[SettingsContext] Clearing dangling chat model:', loadedSettings.chatModel);
        loadedSettings.chatModel = '';
      }
      if (loadedSettings.analyzeModel && !summaryServed(loadedSettings.analyzeModel)) {
        console.log('[SettingsContext] Clearing dangling analyze model:', loadedSettings.analyzeModel);
        loadedSettings.analyzeModel = '';
      }

      if (!selectedProviderName && loadedProviders.length > 0) {
        const providerWithKey = loadedProviders.find(hasApiKey);
        if (providerWithKey) {
          selectedProviderName = providerWithKey.provider;
          console.log('[SettingsContext] Auto-selected provider with API key:', selectedProviderName);
        }
      }

      if (!loadedSettings.chatModel) {
        let autoSelectedModel: string | null = null;

        try {
          const lastUsed = localStorage.getItem('kasset_last_used_model');
          if (lastUsed) {
            const { provider: lastProvider, modelId: lastModelId } = JSON.parse(lastUsed);
            const providerMatch = loadedProviders.find(
              p => p.provider === lastProvider && p.active && hasApiKey(p)
            );
            if (providerMatch?.models?.some(m => m.id === lastModelId)) {
              autoSelectedModel = lastModelId;
              console.log('[SettingsContext] Restored last-used model:', lastModelId);
            }
          }
        } catch {
          // localStorage parse error — skip
        }

        if (!autoSelectedModel) {
          for (const provider of loadedProviders) {
            if (provider.active && hasApiKey(provider) && provider.models?.length) {
              autoSelectedModel = provider.models[0].id;
              console.log('[SettingsContext] Auto-selected first available model:', autoSelectedModel);
              break;
            }
          }
        }

        if (autoSelectedModel) {
          loadedSettings.chatModel = autoSelectedModel;
        }
      }

      if (!loadedSettings.transcriptionProvider) {
        const speech = defaultSpeechSelection(loadedProviders);
        if (speech) {
          loadedSettings.transcriptionProvider = speech.provider;
          loadedSettings.transcriptionModel = speech.model;
          console.log('[SettingsContext] Auto-selected transcription model:', speech);
        }
      }

      if (!loadedSettings.analyzeModel && loadedSettings.chatModel) {
        loadedSettings.analyzeModel = loadedSettings.chatModel;
        console.log('[SettingsContext] Auto-selected analyze model:', loadedSettings.analyzeModel);
      }

      console.log('[SettingsContext] Settings loaded successfully');
      console.log('[SettingsContext] Chat model:', loadedSettings.chatModel);
      console.log('[SettingsContext] Transcription model:', loadedSettings.transcriptionModel);
      return { settings: loadedSettings, providers: loadedProviders, selectedProviderName };
    } catch (error) {
      console.error('[SettingsContext] Error loading settings:', error);
      return {
        settings: defaultSettings,
        providers: predefinedProviders.map(p => ({ ...p })),
        selectedProviderName: null,
      };
    }
  }

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Write one snapshot of settings + providers to disk. */
  const persistSnapshot = useCallback(async (snapshot: LoadedSettings, overrides?: Partial<AppSettings>) => {
    const effectiveSettings = overrides
      ? { ...snapshot.settings, ...overrides }
      : snapshot.settings;

    try {
      // Save individual settings as key-value pairs
      for (const key of SETTINGS_KEYS) {
        const value = effectiveSettings[key];
        if (value !== undefined) {
          await store.settings.set(key, JSON.stringify(value));
        }
      }

      // Save selectedProviderName
      if (snapshot.selectedProviderName !== null) {
        await store.settings.set('selectedProviderName', JSON.stringify(snapshot.selectedProviderName));
      }

      // Save providers
      for (const provider of snapshot.providers) {
        await store.providers.upsert(provider);
      }

      console.log('[SettingsContext] Settings saved successfully');
    } catch (error) {
      console.error('[SettingsContext] Error saving settings:', error);
      throw error;
    }
  }, []);

  /** Read the latest cached snapshot (empty before first load resolves). */
  const readSnapshot = useCallback((): LoadedSettings | undefined => {
    return queryClient.getQueryData<LoadedSettings>(queryKeys.storeSettings());
  }, [queryClient]);

  /**
   * Schedule a debounced write-through after a mutation. Rapid successive
   * edits coalesce into one disk write; the trailing edge persists the
   * latest cached snapshot.
   */
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const snapshot = readSnapshot();
      if (snapshot) {
        persistSnapshot(snapshot).catch((error: unknown) =>
          console.error('[SettingsContext] Debounced save failed:', error)
        );
      }
    }, AUTOSAVE_DELAY_MS);
  }, [persistSnapshot, readSnapshot]);

  // Flush any pending debounced write on unmount so a late edit (e.g. typing
  // an API key then immediately switching panels) is never lost.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        const snapshot = queryClient.getQueryData<LoadedSettings>(queryKeys.storeSettings());
        if (snapshot) {
          persistSnapshot(snapshot).catch((error: unknown) =>
            console.error('[SettingsContext] Unmount flush save failed:', error)
          );
        }
      }
    };
  }, [persistSnapshot, queryClient]);

  /** Immediate flush — clears any pending debounce and writes now. */
  const saveSettings = useCallback(async (overrides?: Partial<AppSettings>) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const snapshot = readSnapshot();
    if (!snapshot) return;
    if (overrides) {
      const next = { ...snapshot, settings: { ...snapshot.settings, ...overrides } };
      queryClient.setQueryData(queryKeys.storeSettings(), next);
      await persistSnapshot(next);
    } else {
      await persistSnapshot(snapshot);
    }
  }, [persistSnapshot, queryClient, readSnapshot]);

  /**
   * Apply an optimistic cache update, then debounce the disk write.
   * Sync like before — Query's setQueryData is synchronous.
   */
  const updateCache = useCallback((updater: (prev: LoadedSettings) => LoadedSettings) => {
    queryClient.setQueryData<LoadedSettings>(queryKeys.storeSettings(), (old) =>
      updater(old ?? FALLBACK_SETTINGS)
    );
    schedulePersist();
  }, [queryClient, schedulePersist]);

  const setSettings = useCallback((updates: Partial<AppSettings>) => {
    updateCache(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, [updateCache]);

  const setProviders = useCallback((providers: ModelProvider[]) => {
    updateCache(prev => ({ ...prev, providers }));
  }, [updateCache]);

  const addProvider = useCallback((provider: ModelProvider) => {
    updateCache(prev => ({
      ...prev,
      providers: [...prev.providers, provider],
    }));
  }, [updateCache]);

  const updateProvider = useCallback((providerName: string, updates: Partial<ModelProvider>) => {
    updateCache(prev => ({
      ...prev,
      providers: prev.providers.map(p =>
        p.provider === providerName ? { ...p, ...updates } : p
      ),
    }));
  }, [updateCache]);

  const deleteProvider = useCallback((providerName: string) => {
    updateCache(prev => ({
      ...prev,
      providers: prev.providers.filter(p => p.provider !== providerName),
      selectedProviderName: prev.selectedProviderName === providerName ? null : prev.selectedProviderName,
    }));
  }, [updateCache]);

  const updateProviderSetting = useCallback((providerName: string, settingIndex: number, value: string | boolean | number) => {
    updateCache(prev => ({
      ...prev,
      providers: prev.providers.map(provider => {
        if (provider.provider !== providerName) return provider;

        const updatedSettings = provider.settings.map((setting, index) => {
          if (index !== settingIndex) return setting;
          return {
            ...setting,
            controller_props: {
              ...setting.controller_props,
              value,
            },
          };
        });

        const settingKey = provider.settings[settingIndex]?.key;
        const update: Partial<ModelProvider> = {
          settings: updatedSettings,
        };

        if (settingKey === 'api-key' && typeof value === 'string') {
          update.api_key = value;
        }
        if (settingKey === 'base-url' && typeof value === 'string') {
          update.base_url = value;
        }

        return { ...provider, ...update };
      }),
    }));
  }, [updateCache]);

  const setSelectedProviderName = useCallback((name: string | null) => {
    updateCache(prev => ({ ...prev, selectedProviderName: name }));
  }, [updateCache]);

  // Explicit reload — the query also fetches on mount, so no load effect.
  const loadSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.storeSettings() });
  }, [queryClient]);

  const value: SettingsContextValue = {
    settings: loaded.settings,
    providers: loaded.providers,
    selectedProviderName: loaded.selectedProviderName,
    isLoading,
    selectedProvider,
    setSettings,
    setProviders,
    addProvider,
    updateProvider,
    deleteProvider,
    updateProviderSetting,
    setSelectedProviderName,
    loadSettings,
    saveSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

/**
 * useSettings Hook
 *
 * Access settings state and operations.
 */
export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
