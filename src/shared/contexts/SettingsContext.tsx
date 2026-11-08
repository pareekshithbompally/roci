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
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import type { AppSettings } from '@shared/types';
import type { ModelProvider, ProviderSetting } from '@shared/types/modelProviders';
import { store } from '@services/db';
import { predefinedProviders, MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import { ENGINES } from '@services/ai/transcription';

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
  updateProviderSetting: (providerName: string, settingIndex: number, value: any) => void;
  /** Set selected provider */
  setSelectedProviderName: (name: string | null) => void;
  /** Load settings from storage */
  loadSettings: () => Promise<void>;
  /** Save settings to storage */
  saveSettings: (overrides?: Partial<AppSettings>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  transcriptionModel: '',
  chatModel: '',
  analyzeModel: '',
  apiKey: '',
  audioQualityPreset: 'voice',
  defaultAudioSource: 'systemAndMicrophone',
  categories: ['Work', 'Personal', 'Meeting', 'Idea'],
  jobProcessing: { mode: 'sequential', maxConcurrent: 2 },
  summaryExtraction: {
    keyDiscussionPoints: true,
    decisionsMade: true,
    actionItems: true,
    nextSteps: true,
  },
  meetingDefaults: {
    autoTitle: true,
    durationReminderMinutes: 60,
  },
};

const SETTINGS_KEYS: Array<keyof AppSettings> = [
  'transcriptionModel', 'chatModel', 'analyzeModel', 'kgExtractionModel',
  'apiKey', 'audioQualityPreset', 'defaultAudioSource',
  'jobProcessing', 'summaryExtraction', 'meetingDefaults', 'calendarIntegration',
];

const initialState: SettingsState = {
  settings: defaultSettings,
  providers: [],
  selectedProviderName: null,
  isLoading: true,
};

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


export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [state, setState] = useState<SettingsState>(initialState);
  const isInitializedRef = useRef(false);
  const stateRef = useRef<SettingsState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const selectedProvider = state.providers.find(
    p => p.provider === state.selectedProviderName
  );

  const loadSettings = useCallback(async () => {
    console.log('[SettingsContext] Loading settings...');
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await store.initialize();
      const { settings: loadedSettings, selectedProviderName: savedProviderName } = await loadSettingsFromStore();

      let loadedProviders: ModelProvider[];
      let selectedProviderName: string | null = savedProviderName;

      const savedProviders = await store.providers.list();

      if (savedProviders.length > 0) {
        console.log('[SettingsContext] Using saved providers, count:', savedProviders.length);
        loadedProviders = mergeProviders(savedProviders, predefinedProviders);
      } else {
        console.log('[SettingsContext] No saved providers, using predefined');
        loadedProviders = predefinedProviders.map(p => ({ ...p }));
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

      if (!loadedSettings.transcriptionModel) {
        const preferOrder = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-transcribe-diarize', 'groq-whisper', 'gemini'] as const;
        for (const engineId of preferOrder) {
          const engine = ENGINES[engineId];
          if (!engine) continue;
          const provider = loadedProviders.find(
            (p) => p.provider === engine.providerId && p.active && hasApiKey(p),
          );
          if (provider) {
            loadedSettings.transcriptionModel = engineId;
            console.log('[SettingsContext] Auto-selected transcription engine:', engineId);
            break;
          }
        }
      }

      if (!loadedSettings.analyzeModel && loadedSettings.chatModel) {
        loadedSettings.analyzeModel = loadedSettings.chatModel;
        console.log('[SettingsContext] Auto-selected analyze model:', loadedSettings.analyzeModel);
      }

      setState({
        settings: loadedSettings,
        providers: loadedProviders,
        selectedProviderName,
        isLoading: false,
      });

      console.log('[SettingsContext] Settings loaded successfully');
      console.log('[SettingsContext] Chat model:', loadedSettings.chatModel);
      console.log('[SettingsContext] Transcription model:', loadedSettings.transcriptionModel);
    } catch (error) {
      console.error('[SettingsContext] Error loading settings:', error);
      setState({
        settings: defaultSettings,
        providers: predefinedProviders.map(p => ({ ...p })),
        selectedProviderName: null,
        isLoading: false,
      });
    } finally {
      isInitializedRef.current = true;
    }
  }, []);

  const saveSettings = useCallback(async (overrides?: Partial<AppSettings>) => {
    const currentState = stateRef.current;

    if (!isInitializedRef.current || currentState.isLoading) {
      console.log('[SettingsContext] Skipping save - not initialized or loading');
      return;
    }

    const effectiveSettings = overrides
      ? { ...currentState.settings, ...overrides }
      : currentState.settings;

    try {
      // Save individual settings as key-value pairs
      for (const key of SETTINGS_KEYS) {
        const value = effectiveSettings[key];
        if (value !== undefined) {
          await store.settings.set(key, JSON.stringify(value));
        }
      }

      // Save selectedProviderName
      if (currentState.selectedProviderName !== null) {
        await store.settings.set('selectedProviderName', JSON.stringify(currentState.selectedProviderName));
      }

      // Save providers
      for (const provider of currentState.providers) {
        await store.providers.upsert(provider);
      }

      console.log('[SettingsContext] Settings saved successfully');
    } catch (error) {
      console.error('[SettingsContext] Error saving settings:', error);
      throw error;
    }
  }, []);

  const setSettings = useCallback((updates: Partial<AppSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  const setProviders = useCallback((providers: ModelProvider[]) => {
    setState(prev => ({ ...prev, providers }));
  }, []);

  const addProvider = useCallback((provider: ModelProvider) => {
    setState(prev => ({
      ...prev,
      providers: [...prev.providers, provider],
    }));
  }, []);

  const updateProvider = useCallback((providerName: string, updates: Partial<ModelProvider>) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.map(p =>
        p.provider === providerName ? { ...p, ...updates } : p
      ),
    }));
  }, []);

  const deleteProvider = useCallback((providerName: string) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.filter(p => p.provider !== providerName),
      selectedProviderName: prev.selectedProviderName === providerName ? null : prev.selectedProviderName,
    }));
  }, []);

  const updateProviderSetting = useCallback((providerName: string, settingIndex: number, value: any) => {
    setState(prev => ({
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
  }, []);

  const setSelectedProviderName = useCallback((name: string | null) => {
    setState(prev => ({ ...prev, selectedProviderName: name }));
  }, []);

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: SettingsContextValue = {
    ...state,
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
