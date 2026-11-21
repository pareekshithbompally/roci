/** App settings and model providers, merged with predefined providers and auto-persisted after each edit. */

import { DEFAULT_NOTIFICATION_SETTINGS } from '@config/notifications.config';
import React, { createContext, useContext, useCallback, ReactNode, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { store } from '@services/db';
import { predefinedProviders, MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import { modelSources } from '@shared/utils/modelResolver';
import { defaultSpeechSelection } from '@services/ai/transcription';
import { queryKeys } from '@shared/query/queryKeys';
import { getLocalModels, type LocalModel } from '@services/localModels.service';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';

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

/** A provider change: fields to set, or a function of the provider as saved now. */
type ProviderUpdate = Partial<ModelProvider> | ((current: ModelProvider) => Partial<ModelProvider>);

interface SettingsContextValue extends SettingsState {
  /** Get selected provider */
  selectedProvider: ModelProvider | undefined;
  /** Set app settings: the changes, or computed from the settings as they are now (so quick successive edits all land). */
  setSettings: (updates: Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>)) => void;
  /** Add a provider */
  addProvider: (provider: ModelProvider) => void;
  /** Updates as given, or computed from the provider as saved now (for async results that must not overwrite newer edits). */
  updateProvider: (providerName: string, updates: ProviderUpdate) => void;
  /** Update provider setting */
  updateProviderSetting: (providerName: string, settingIndex: number, value: string | boolean | number) => void;
  /** Set selected provider */
  setSelectedProviderName: (name: string | null) => void;
  /** Save settings to storage */
  saveSettings: (overrides?: Partial<AppSettings>) => Promise<void>;
}

export const defaultSettings: AppSettings = {
  transcriptionModel: '',
  chatModel: '',
  analyzeModel: '',
  apiKey: '',
  defaultAudioSource: 'systemAndMicrophone',
  autoTranscribe: false,
  jobProcessing: { mode: 'sequential', maxConcurrent: 2 },
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
};

/** Every setting is saved: the type makes a new setting missing here a compile error. */
const PERSISTED_SETTINGS: Record<keyof AppSettings, true> = {
  analyzeModel: true,
  apiKey: true,
  appleIntelligenceIntegration: true,
  appleNotesIntegration: true,
  autoTranscribe: true,
  calendarIntegration: true,
  chatExtrasModel: true,
  chatModel: true,
  chatTitles: true,
  chatTools: true,
  defaultAudioSource: true,
  followUps: true,
  hexIntegration: true,
  hideToolCalls: true,
  imageModel: true,
  imageProvider: true,
  jobProcessing: true,
  liveTranscription: true,
  notifications: true,
  onboarding: true,
  personalization: true,
  readAloudEngine: true,
  readAloudVoice: true,
  remindersIntegration: true,
  showModelAvatars: true,
  modelIdleMinutes: true,
  spotlightIntegration: true,
  storageRetention: true,
  transcriptionModel: true,
  transcriptionProvider: true,
};
const SETTINGS_KEYS = Object.keys(PERSISTED_SETTINGS) as Array<keyof AppSettings>;

/** What disk holds, as saved (JSON per setting, per provider): a save writes only what differs from it. */
const onDisk = {
  settings: new Map<string, string | undefined>(),
  providers: new Map<string, string>(),
};

/** Trailing debounce so rapid edits (typing an API key, toggling a list) coalesce into one disk write. */
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
  onDisk.settings = new Map(Object.entries(raw));
  const loaded: Partial<AppSettings> = {};

  for (const key of SETTINGS_KEYS) {
    if (raw[key]) {
      try {
        const value = JSON.parse(raw[key]);
        // `null` is a cleared setting (see persistSnapshot): left out, so its default applies.
        if (value !== null) (loaded as any)[key] = value;
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
export interface LoadedSettings {
  settings: AppSettings;
  providers: ModelProvider[];
  selectedProviderName: string | null;
}

const FALLBACK_SETTINGS: LoadedSettings = {
  settings: defaultSettings,
  providers: [],
  selectedProviderName: null,
};

/** Provider ids removed from the app; saved configs with them are deleted on load. */
const RETIRED_PROVIDER_IDS = new Set(['azure', 'cohere', 'huggingface', 'xai', 'local:llamacpp']);

/** A read-aloud engine that's no longer offered (a removed voice model) falls back to the system voices. */
function dropRemovedVoiceEngine(settings: AppSettings, localModels: LocalModel[]): void {
  const engine = settings.readAloudEngine;
  if (!engine || engine === READ_ALOUD_CONFIG.system.id || localModels.some((m) => m.kind === 'voice' && m.id === engine)) return;
  console.log('[SettingsContext] Clearing removed read-aloud engine:', engine);
  settings.readAloudEngine = undefined;
  settings.readAloudVoice = undefined;
}

/** Clears a chat, summary or titles & follow-ups model that no source serves any more, so a working one is picked instead. */
function dropUnservedModels(settings: AppSettings, sources: ModelProvider[]): void {
  const served = (id: string) => sources.some((p) => p.models?.some((m) => m.id === id));
  if (settings.chatModel && !served(settings.chatModel)) {
    console.log('[SettingsContext] Clearing dangling chat model:', settings.chatModel);
    settings.chatModel = '';
  }
  if (settings.analyzeModel && !served(settings.analyzeModel)) {
    console.log('[SettingsContext] Clearing dangling analyze model:', settings.analyzeModel);
    settings.analyzeModel = '';
  }
  if (settings.chatExtrasModel && !served(settings.chatExtrasModel)) {
    console.log('[SettingsContext] Clearing dangling titles & follow-ups model:', settings.chatExtrasModel);
    settings.chatExtrasModel = undefined;
  }
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data: loaded = FALLBACK_SETTINGS, isLoading } = useQuery({
    queryKey: queryKeys.storeSettings(),
    queryFn: loadAllSettings,
  });

  /** The settings query function: loads the full snapshot on mount and on invalidation. */
  async function loadAllSettings(): Promise<LoadedSettings> {
    console.log('[SettingsContext] Loading settings...');

    try {
      await store.initialize();
      const { settings: loadedSettings, selectedProviderName: savedProviderName } = await loadSettingsFromStore();

      let loadedProviders: ModelProvider[];
      let selectedProviderName: string | null = savedProviderName;

      const savedProviders = await store.providers.list();
      onDisk.providers = new Map(savedProviders.map((p) => [p.provider, JSON.stringify(p)]));

      // Retired providers must never reappear: drop them from disk and from this load.
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

      // Drop selections of providers that no longer exist so the auto-select below picks a working one.
      if (selectedProviderName && !loadedProviders.some((p) => p.provider === selectedProviderName)) {
        console.log('[SettingsContext] Clearing dangling selected provider:', selectedProviderName);
        selectedProviderName = null;
      }
      // A model may also be built in (Apple Intelligence) or downloaded to this device: check only when every source is known.
      const localModels = await queryClient
        .fetchQuery({ queryKey: queryKeys.localModels(), queryFn: getLocalModels })
        .catch((error: unknown) => {
          console.error('[SettingsContext] Local models unavailable; keeping saved model choices:', error);
          return null;
        });
      if (localModels) {
        dropUnservedModels(loadedSettings, modelSources(loadedProviders, loadedSettings, localModels));
        dropRemovedVoiceEngine(loadedSettings, localModels);
      }

      if (!selectedProviderName && loadedProviders.length > 0) {
        const providerWithKey = loadedProviders.find(hasApiKey);
        if (providerWithKey) {
          selectedProviderName = providerWithKey.provider;
          console.log('[SettingsContext] Auto-selected provider with API key:', selectedProviderName);
        }
      }

      if (!loadedSettings.chatModel) {
        // No chat model yet: the first model of the first usable provider.
        const autoSelectedModel = loadedProviders.find((p) => p.active && hasApiKey(p) && p.models?.length)?.models?.[0]?.id;
        if (autoSelectedModel) {
          loadedSettings.chatModel = autoSelectedModel;
          console.log('[SettingsContext] Auto-selected first available model:', autoSelectedModel);
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
      // An unset setting is saved as `null`, so clearing it sticks.
      const values: Array<[string, string]> = SETTINGS_KEYS.map((key) => [key, JSON.stringify(effectiveSettings[key] ?? null)]);
      if (snapshot.selectedProviderName !== null) values.push(['selectedProviderName', JSON.stringify(snapshot.selectedProviderName)]);
      for (const [key, value] of values) {
        if (onDisk.settings.get(key) === value) continue;
        await store.settings.set(key, value);
        onDisk.settings.set(key, value);
      }
      for (const provider of snapshot.providers) {
        const value = JSON.stringify(provider);
        if (onDisk.providers.get(provider.provider) === value) continue;
        await store.providers.upsert(provider);
        onDisk.providers.set(provider.provider, value);
      }
    } catch (error) {
      console.error('[SettingsContext] Error saving settings:', error);
      throw error;
    }
  }, []);

  /** Read the latest cached snapshot (empty before first load resolves). */
  const readSnapshot = useCallback((): LoadedSettings | undefined => {
    return queryClient.getQueryData<LoadedSettings>(queryKeys.storeSettings());
  }, [queryClient]);

  /** Debounced write-through: the trailing edge persists the latest cached snapshot. */
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

  // Flush a pending write on unmount so a late edit (typing a key, then switching panels) is never lost.
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

  /** Optimistic, synchronous cache update (a reload in flight is cancelled so it can't overwrite it), then a debounced disk write. */
  const updateCache = useCallback((updater: (prev: LoadedSettings) => LoadedSettings) => {
    void queryClient.cancelQueries({ queryKey: queryKeys.storeSettings() });
    queryClient.setQueryData<LoadedSettings>(queryKeys.storeSettings(), (old) =>
      updater(old ?? FALLBACK_SETTINGS)
    );
    schedulePersist();
  }, [queryClient, schedulePersist]);

  const setSettings = useCallback((updates: Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>)) => {
    updateCache(prev => ({
      ...prev,
      settings: { ...prev.settings, ...(typeof updates === 'function' ? updates(prev.settings) : updates) },
    }));
  }, [updateCache]);

  const addProvider = useCallback((provider: ModelProvider) => {
    updateCache(prev => ({
      ...prev,
      providers: [...prev.providers, provider],
    }));
  }, [updateCache]);

  const updateProvider = useCallback((providerName: string, updates: ProviderUpdate) => {
    updateCache(prev => ({
      ...prev,
      providers: prev.providers.map(p =>
        p.provider === providerName ? { ...p, ...(typeof updates === 'function' ? updates(p) : updates) } : p
      ),
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

  // One value per settings change, so its users re-render only when settings do.
  const value = useMemo<SettingsContextValue>(() => ({
    settings: loaded.settings,
    providers: loaded.providers,
    selectedProviderName: loaded.selectedProviderName,
    isLoading,
    selectedProvider: loaded.providers.find((p) => p.provider === loaded.selectedProviderName),
    setSettings,
    addProvider,
    updateProvider,
    updateProviderSetting,
    setSelectedProviderName,
    saveSettings,
  }), [loaded, isLoading, setSettings, addProvider, updateProvider, updateProviderSetting, setSelectedProviderName, saveSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
