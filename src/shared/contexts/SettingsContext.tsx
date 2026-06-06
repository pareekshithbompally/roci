/**
 * Settings Context
 * 
 * Manages application settings and model providers.
 * 
 * Key features:
 * - Persists settings to file storage
 * - Merges saved providers with predefined providers (for new providers added in updates)
 * - Auto-saves on changes with debounce (only after initial load completes)
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import type { AppSettings } from '@shared/types';
import type { ModelProvider, ProviderSetting } from '@shared/types/modelProviders';
import { settingsService } from '@services/storage';
import { predefinedProviders, MANAGED_SDK_PROVIDERS } from '@config/providers.config';

interface SettingsState {
  /** App settings */
  settings: AppSettings;
  /** Model providers */
  providers: ModelProvider[];
  /** Currently selected provider name */
  selectedProviderName: string | null;
  /** Current view: home or settings */
  currentView: 'home' | 'settings';
  /** Active settings panel */
  activeSettingsPanel: 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface';
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
  /** Set current view */
  setCurrentView: (view: 'home' | 'settings') => void;
  /** Set active settings panel */
  setActiveSettingsPanel: (panel: 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface') => void;
  /** Load settings from storage */
  loadSettings: () => Promise<void>;
  /** Save settings to storage */
  saveSettings: (overrides?: Partial<AppSettings>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  transcriptionModel: '', // User must select in Settings > Providers > Model Config
  chatModel: '', // User must select in Settings > Providers > Model Config
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

// Initial state with loading=true to prevent any saves before load completes
const initialState: SettingsState = {
  settings: defaultSettings,
  providers: [], // Start empty, will be populated from storage or predefined
  selectedProviderName: null,
  currentView: 'home',
  activeSettingsPanel: 'audio',
  isLoading: true, // Start with loading=true
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Merge saved providers with predefined providers.
 * - Uses saved data for providers that exist in both
 * - Adds new predefined providers that don't exist in saved data
 * - Preserves user's API keys, models, and settings from saved data
 */
function mergeProviders(savedProviders: ModelProvider[], predefined: ModelProvider[]): ModelProvider[] {
  const merged: ModelProvider[] = [];
  const savedProviderMap = new Map(savedProviders.map(p => [p.provider, p]));
  
  // First, add all predefined providers (in their original order)
  // but use saved data if available
  for (const predefinedProvider of predefined) {
    const savedProvider = savedProviderMap.get(predefinedProvider.provider);
    
    if (savedProvider) {
      // Use saved provider data (has user's API keys, models, etc.)
      merged.push(savedProvider);
      savedProviderMap.delete(predefinedProvider.provider);
    } else {
      // New provider from predefined - add it
      merged.push({ ...predefinedProvider });
    }
  }
  
  // Add any custom providers that user added but aren't in predefined
  for (const [, customProvider] of savedProviderMap) {
    merged.push(customProvider);
  }

  // Strip stale base-url settings from managed SDK providers
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

/**
 * Check if a provider has a valid API key configured
 */
function hasApiKey(provider: ModelProvider): boolean {
  // Check api_key field
  if (provider.api_key && typeof provider.api_key === 'string' && provider.api_key.trim() !== '') {
    return true;
  }
  // Check settings array for api-key
  const apiKeySetting = provider.settings?.find((s) => s.key === 'api-key');
  const value = apiKeySetting?.controller_props?.value;
  return typeof value === 'string' && value.trim() !== '';
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [state, setState] = useState<SettingsState>(initialState);
  const isInitializedRef = useRef(false);
  const stateRef = useRef<SettingsState>(state);

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Selected provider computed
  const selectedProvider = state.providers.find(
    p => p.provider === state.selectedProviderName
  );

  // Load settings from storage
  const loadSettings = useCallback(async () => {
    console.log('[SettingsContext] Loading settings...');
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await settingsService.load();
      console.log('[SettingsContext] settingsService.load() result:', result.success);
      
      if (result.success && result.data) {
        const data = result.data;
        console.log('[SettingsContext] Raw data from storage:');
        console.log('[SettingsContext] - providers:', (data as any).providers?.length || 0);
        console.log('[SettingsContext] - chatModel:', (data as any).chatModel);
        console.log('[SettingsContext] - aiModel:', data.aiModel);
        
        // Map storage settings to app settings format
        const loadedSettings: AppSettings = {
          transcriptionModel: data.aiModel || '',
          chatModel: (data as any).chatModel || '',
          apiKey: data.geminiApiKey || '',
          audioQualityPreset: data.audioQualityPreset || 'voice',
          defaultAudioSource: (data as any).defaultAudioSource || 'systemAndMicrophone',
          categories: (data as any).categories || defaultSettings.categories,
          jobProcessing: (data as any).jobProcessing || defaultSettings.jobProcessing,
          summaryExtraction: (data as any).summaryExtraction || defaultSettings.summaryExtraction,
          meetingDefaults: (data as any).meetingDefaults || defaultSettings.meetingDefaults,
          calendarIntegration: (data as any).calendarIntegration ?? undefined,
        };

        // Merge saved providers with predefined providers
        // This ensures new providers from app updates are added, while preserving user data
        let loadedProviders: ModelProvider[];
        if (data.providers && Array.isArray(data.providers) && data.providers.length > 0) {
          console.log('[SettingsContext] Using saved providers, count:', data.providers.length);
          loadedProviders = mergeProviders(data.providers, predefinedProviders);
          console.log('[SettingsContext] Merged providers from storage with predefined');
        } else {
          console.log('[SettingsContext] No providers in data, using predefined');
          // No saved providers - use predefined
          loadedProviders = predefinedProviders.map(p => ({ ...p }));
          console.log('[SettingsContext] Using predefined providers (no saved data)');
        }

        // Load selected provider
        let selectedProviderName = data.selectedProviderName !== undefined ? data.selectedProviderName : null;
        
        // Auto-select a provider if none is selected but providers with API keys exist
        if (!selectedProviderName && loadedProviders.length > 0) {
          const providerWithKey = loadedProviders.find(hasApiKey);
          if (providerWithKey) {
            selectedProviderName = providerWithKey.provider;
            console.log('[SettingsContext] Auto-selected provider with API key:', selectedProviderName);
          }
        }

        // Auto-select model if none persisted — fallback chain:
        // 1. Loaded chatModel from storage (already set above)
        // 2. Last-used model from localStorage
        // 3. First model from first active provider with API key
        if (!loadedSettings.chatModel) {
          let autoSelectedModel: string | null = null;

          // Try last-used model from localStorage
          try {
            const lastUsed = localStorage.getItem('kasset_last_used_model');
            if (lastUsed) {
              const { provider: lastProvider, modelId: lastModelId } = JSON.parse(lastUsed);
              // Validate: provider still active, model still exists
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

          // Fallback: first model from first active provider with API key + models
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

        setState({
          settings: loadedSettings,
          providers: loadedProviders,
          selectedProviderName: selectedProviderName,
          currentView: 'home',
          activeSettingsPanel: 'audio',
          isLoading: false,
        });

        console.log('[SettingsContext] Settings loaded successfully');
        console.log('[SettingsContext] Chat model:', loadedSettings.chatModel);
        console.log('[SettingsContext] Transcription model:', loadedSettings.transcriptionModel);
        console.log('[SettingsContext] Providers with models:',
          loadedProviders.filter(p => p.models && p.models.length > 0).map(p => `${p.provider}(${p.models.length})`).join(', ')
        );
      } else {
        // No saved data - use defaults with predefined providers
        console.log('[SettingsContext] No saved settings found, using defaults');
        setState({
          settings: defaultSettings,
          providers: predefinedProviders.map(p => ({ ...p })),
          selectedProviderName: null,
          currentView: 'home',
          activeSettingsPanel: 'audio',
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('[SettingsContext] Error loading settings:', error);
      // On error, use defaults
      setState({
        settings: defaultSettings,
        providers: predefinedProviders.map(p => ({ ...p })),
        selectedProviderName: null,
        currentView: 'home',
        activeSettingsPanel: 'audio',
        isLoading: false,
      });
    } finally {
      // Mark as initialized AFTER state is set
      isInitializedRef.current = true;
    }
  }, []);

  // Save settings to storage - uses ref to always get latest state
  const saveSettings = useCallback(async (overrides?: Partial<AppSettings>) => {
    const currentState = stateRef.current;

    // Don't save if not initialized or still loading
    if (!isInitializedRef.current || currentState.isLoading) {
      console.log('[SettingsContext] Skipping save - not initialized or loading');
      return;
    }

    // Merge overrides so callers can save values that haven't flushed to state yet
    const effectiveSettings = overrides
      ? { ...currentState.settings, ...overrides }
      : currentState.settings;

    try {
      // Build settings object for storage using latest state from ref
      const settingsToSave: any = {
        aiModel: effectiveSettings.transcriptionModel,
        chatModel: effectiveSettings.chatModel,
        geminiApiKey: effectiveSettings.apiKey,
        audioQualityPreset: effectiveSettings.audioQualityPreset,
        defaultAudioSource: effectiveSettings.defaultAudioSource,
        categories: effectiveSettings.categories,
        jobProcessing: effectiveSettings.jobProcessing,
        summaryExtraction: effectiveSettings.summaryExtraction,
        meetingDefaults: effectiveSettings.meetingDefaults,
        calendarIntegration: effectiveSettings.calendarIntegration,
        providers: currentState.providers,
        selectedProviderName: currentState.selectedProviderName,
        // Include other default fields
        theme: 'system',
        autoSave: true,
        notificationsEnabled: true,
        recordingQuality: 'high',
        autoTranscribe: true,
      };

      await settingsService.save(settingsToSave);
      console.log('[SettingsContext] Settings saved successfully');
    } catch (error) {
      console.error('[SettingsContext] Error saving settings:', error);
      throw error; // Re-throw so callers can handle
    }
  }, []); // No dependencies - always uses ref for latest state

  // Set settings
  const setSettings = useCallback((updates: Partial<AppSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  // Set providers
  const setProviders = useCallback((providers: ModelProvider[]) => {
    setState(prev => ({ ...prev, providers }));
  }, []);

  // Add provider
  const addProvider = useCallback((provider: ModelProvider) => {
    setState(prev => ({
      ...prev,
      providers: [...prev.providers, provider],
    }));
  }, []);

  // Update provider
  const updateProvider = useCallback((providerName: string, updates: Partial<ModelProvider>) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.map(p =>
        p.provider === providerName ? { ...p, ...updates } : p
      ),
    }));
  }, []);

  // Delete provider
  const deleteProvider = useCallback((providerName: string) => {
    setState(prev => ({
      ...prev,
      providers: prev.providers.filter(p => p.provider !== providerName),
      selectedProviderName: prev.selectedProviderName === providerName ? null : prev.selectedProviderName,
    }));
  }, []);

  // Update provider setting
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

        // Also update top-level fields for convenience
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

  // Set selected provider
  const setSelectedProviderName = useCallback((name: string | null) => {
    setState(prev => ({ ...prev, selectedProviderName: name }));
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // NOTE: Auto-save removed - use saveSettings() explicitly when user clicks Save

  // Set current view
  const setCurrentView = useCallback((view: 'home' | 'settings') => {
    setState(prev => ({ ...prev, currentView: view }));
  }, []);

  // Set active settings panel
  const setActiveSettingsPanel = useCallback((panel: 'audio' | 'providers' | 'local-inference' | 'categories' | 'interface') => {
    setState(prev => ({ ...prev, activeSettingsPanel: panel }));
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
    setCurrentView,
    setActiveSettingsPanel,
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
