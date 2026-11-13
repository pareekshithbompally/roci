/**
 * ProvidersPanel Component
 *
 * Two-column master-detail layout: sticky provider sidebar + scrollable detail panel.
 * Uses the context's selectedProviderName as single source of truth (with localStorage
 * fallback for first-mount initialization only).
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Search, Loader2, Settings, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useModalities } from '../stores/modalitiesStore';
import ProvidersAvatar from '@shared/components/ProvidersAvatar';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { providersService } from '@services/providers';
import { modalitiesService } from '@services/modalities';
import { getManagedSDKInfo, getDefaultBaseUrl } from '@shared/utils/modelResolver';
import { MANAGED_MODELS, MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import { ModalityIcons } from './ModalityIcons';
import { ModelSettingsModal } from './ModelSettingsModal';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, LAYOUT } from '@config/theme.config';
import { SettingsSection, SettingsInput, SecretInput, Toggle, InfoCallout, ModelListItem } from './shared';
import { Popover, PopoverAnchor, PopoverContent } from '@shared/ui';
import { Command, CommandList, CommandItem, CommandEmpty } from '@shared/ui';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { ModelInfo } from '@services/modalities';

const STORAGE_KEY = 'kasset_ai_last_provider_selection';

export const ProvidersPanel: React.FC = () => {
  const {
    providers,
    updateProvider,
    updateProviderSetting,
    selectedProviderName,
    setSelectedProviderName,
  } = useSettings();

  const { showToast } = useToast();
  const modalitiesLoaded = useModalities();
  const [showSetupBanner, setShowSetupBanner] = useState(true);

  const anyProviderHasModels = providers.some(p => p.active && p.models && p.models.length > 0);

  // Initialize selectedProviderName: context first, localStorage fallback
  const effectiveSelectedProvider = selectedProviderName
    || (() => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            return parsed.providerName || null;
          }
        } catch { /* ignore */ }
        return null;
      })()
    || providers[0]?.provider
    || null;

  // Sync to localStorage whenever it changes
  useEffect(() => {
    if (effectiveSelectedProvider) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          providerName: effectiveSelectedProvider,
        }));
      } catch { /* ignore */ }
    }
  }, [effectiveSelectedProvider]);

  const selectedProvider = effectiveSelectedProvider
    ? providers.find(p => p.provider === effectiveSelectedProvider)
    : null;

  // Per-model settings modal state
  const [modelSettingsTarget, setModelSettingsTarget] = useState<{ provider: string; modelId: string } | null>(null);

  const [modelSearch, setModelSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const isManaged = selectedProvider ? MANAGED_SDK_PROVIDERS.has(selectedProvider.provider) : false;
  const hasHardcodedModels = selectedProvider ? !!MANAGED_MODELS[selectedProvider.provider] : false;

  const handleSelectProvider = (providerName: string) => {
    setSelectedProviderName(providerName);
  };

  const handleSearchModels = async () => {
    if (!selectedProvider) return;

    const providerName = selectedProvider.provider;
    const apiKeySetting = selectedProvider.settings.find(s => s.key === 'api-key');
    const baseUrlSetting = selectedProvider.settings.find(s => s.key === 'base-url');

    const apiKey = apiKeySetting?.controller_props.value as string || '';
    const baseUrl = baseUrlSetting?.controller_props.value as string || '';

    if (MANAGED_MODELS[providerName]) {
      const filtered = MANAGED_MODELS[providerName].filter(id =>
        id.toLowerCase().includes(modelSearch.toLowerCase())
      );
      if (filtered.length === 0 && modelSearch.trim()) {
        setSearchResults([modelSearch.trim()]);
      } else {
        setSearchResults(filtered);
      }
      setShowSearchDropdown(true);
      return;
    }

    if (isManaged) {
      if (!apiKey) {
        showToast('Please configure your API key first', 'error');
        return;
      }
    } else {
      if (!apiKey || !baseUrl) {
        showToast('Please configure API key and Base URL first', 'error');
        return;
      }
    }

    const providerWithConfig: ModelProvider = {
      ...selectedProvider,
      api_key: apiKey,
      base_url: baseUrl || getDefaultBaseUrl(providerName) || '',
    };

    setIsSearching(true);
    setSearchResults([]);
    try {
      const modelIds = await providersService.fetchModelsFromProvider(providerWithConfig);

      const filteredModelIds = modelSearch.trim()
        ? modelIds.filter(id => id.toLowerCase().includes(modelSearch.toLowerCase()))
        : modelIds;

      if (filteredModelIds.length === 0 && modelSearch.trim()) {
        setSearchResults([modelSearch.trim()]);
      } else {
        setSearchResults(filteredModelIds);
      }
      setShowSearchDropdown(true);
    } catch (error) {
      console.error('[ProvidersPanel] Failed to search models:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast(`Failed to search models: ${errorMessage}`, 'error');
      setShowSearchDropdown(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    if (!selectedProvider) return;

    if (selectedProvider.models?.some(m => m.id === modelId)) {
      return;
    }

    updateProvider(selectedProvider.provider, {
      models: [...(selectedProvider.models || []), { id: modelId, name: modelId }]
    });

    setModelSearch('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  const handleRemoveModel = (modelId: string) => {
    if (!selectedProvider) return;

    updateProvider(selectedProvider.provider, {
      models: (selectedProvider.models || []).filter(m => m.id !== modelId)
    });
  };

  const getApiKeyValue = () => {
    if (!selectedProvider) return '';
    const apiKeySetting = selectedProvider.settings.find(s => s.key === 'api-key');
    return apiKeySetting?.controller_props.value as string || '';
  };

  const getBaseUrlValue = () => {
    if (!selectedProvider) return '';
    const baseUrlSetting = selectedProvider.settings.find(s => s.key === 'base-url');
    return baseUrlSetting?.controller_props.value as string || '';
  };

  const getModelInfo = (providerName: string, modelId: string): ModelInfo | null => {
    if (!modalitiesLoaded) return null;
    return modalitiesService.getModelInfo(providerName, modelId);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Pinned Header */}
      <div className={`shrink-0 ${LAYOUT.settingsPadding} pt-6 pb-4`}>
        <div className={LAYOUT.settingsMaxWidth + ' mx-auto'}>
          <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
            Model Providers
          </h3>
          <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
            Enable providers and configure API keys to access AI models.
          </p>
        </div>
      </div>

      {/* Split scroll body */}
      <div className={`flex-1 min-h-0 flex ${LAYOUT.settingsPadding} pb-6`}>
        <div className={`${LAYOUT.settingsMaxWidth} mx-auto w-full flex gap-6 min-h-0`}>
        {/* Left: Provider list — independent scroll */}
        <div className="w-56 shrink-0 overflow-y-auto custom-scrollbar">
          <SettingsSection title="Providers">
            <div className="space-y-1">
              {providers.map((provider) => {
                const isSelected = effectiveSelectedProvider === provider.provider;
                return (
                  <button
                    key={provider.provider}
                    onClick={() => handleSelectProvider(provider.provider)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 ${RADIUS.md} text-left transition-all border ${
                      isSelected
                        ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
                        : `${SURFACE.card} ${BORDER.default} ${BORDER.cardHover}`
                    }`}
                  >
                    <ProvidersAvatar provider={provider.provider} size={20} />
                    <span className={`flex-1 truncate ${TYPOGRAPHY_CLASSES.settingsInputLabel} ${
                      isSelected ? TEXT.heading : TEXT.primary
                    }`}>
                      {getProviderTitle(provider.provider)}
                    </span>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={provider.active}
                        onChange={(checked) => {
                          updateProvider(provider.provider, { active: checked });
                        }}
                        label={`Toggle ${getProviderTitle(provider.provider)}`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </SettingsSection>
        </div>

        {/* Right: Detail panel — independent scroll */}
        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar space-y-6">
          {selectedProvider ? (
            <>
              {showSetupBanner && !anyProviderHasModels && (
                <div className="mb-4 relative">
                  <InfoCallout variant="info">
                    <strong>Quick setup:</strong> Pick a provider on the left, enter your API key, and add at least one model — changes save automatically.
                  </InfoCallout>
                  <button
                    onClick={() => setShowSetupBanner(false)}
                    className={`absolute top-2 right-2 p-1 ${SURFACE.hoverSubtle} rounded-md transition-colors`}
                    aria-label="Dismiss"
                  >
                    <X className={`w-3.5 h-3.5 ${TEXT.faint}`} />
                  </button>
                </div>
              )}

              <SettingsSection title={`${getProviderTitle(selectedProvider.provider)} Configuration`}>
                {(() => {
                  const sdkInfo = getManagedSDKInfo(selectedProvider.provider);
                  if (sdkInfo) {
                    return <InfoCallout variant="info">{sdkInfo}</InfoCallout>;
                  }
                  return (
                    <InfoCallout variant="neutral">
                      Connects via the OpenAI-compatible Chat Completions endpoint
                    </InfoCallout>
                  );
                })()}

                {selectedProvider.settings.map((setting, index) => {
                  if (setting.key === 'base-url' && isManaged) {
                    return null;
                  }

                  const isApiKey = setting.key === 'api-key';
                  const value = (setting.controller_props.value as string) || '';

                  if (isApiKey) {
                    return (
                      <SecretInput
                        key={setting.key}
                        value={value}
                        onChange={(val) => {
                          updateProviderSetting(selectedProvider.provider, index, val);
                        }}
                        placeholder={setting.controller_props.placeholder}
                        label={setting.title}
                        helper={setting.description}
                      />
                    );
                  }

                  return (
                    <SettingsInput
                      key={setting.key}
                      value={value}
                      onChange={(e) => {
                        updateProviderSetting(selectedProvider.provider, index, e.target.value);
                      }}
                      placeholder={setting.controller_props.placeholder}
                      label={setting.title}
                      helper={setting.description}
                    />
                  );
                })}

                {selectedProvider.explore_models_url && (
                  <button
                    type="button"
                    onClick={() => {
                      open(selectedProvider.explore_models_url!).catch(err => {
                        console.error('[ProvidersPanel] Failed to open URL:', err);
                        window.open(selectedProvider.explore_models_url, '_blank', 'noopener,noreferrer');
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Explore available models
                  </button>
                )}
              </SettingsSection>

              {/* Add Models */}
              <SettingsSection title="Add Models">
                <Popover open={showSearchDropdown} onOpenChange={setShowSearchDropdown}>
                  <PopoverAnchor asChild>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <SettingsInput
                          value={modelSearch}
                          onChange={(e) => {
                            setModelSearch(e.target.value);
                            setShowSearchDropdown(false);
                            setSearchResults([]);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSearchModels();
                            } else if (e.key === 'Escape') {
                              setShowSearchDropdown(false);
                            }
                          }}
                          placeholder="Search model name..."
                          disabled={!hasHardcodedModels && (!getApiKeyValue() || (!isManaged && !getBaseUrlValue()))}
                          icon={<Search className={`w-4 h-4 ${TEXT.faint}`} />}
                        />
                      </div>
                      <button
                        onClick={handleSearchModels}
                        disabled={isSearching || (!hasHardcodedModels && (!getApiKeyValue() || (!isManaged && !getBaseUrlValue())))}
                        className={`${COMPONENT.settingsButtonPrimary} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isSearching && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isSearching ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  </PopoverAnchor>

                  {searchResults.length > 0 && (
                    <PopoverContent
                      side="bottom"
                      sideOffset={8}
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Command>
                        <CommandList className="max-h-64">
                          <CommandEmpty>No models found</CommandEmpty>
                          {searchResults.length === 1 && searchResults[0] === modelSearch.trim() && (
                            <div className={`px-3 py-2 border-b ${BORDER.strong} ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                              {hasHardcodedModels ? 'Not in known models — add manually:' : 'Not found via API — add manually:'}
                            </div>
                          )}
                          {searchResults.map((modelId) => {
                            const info = selectedProvider ? getModelInfo(selectedProvider.provider, modelId) : null;
                            return (
                              <CommandItem
                                key={modelId}
                                value={modelId}
                                onSelect={() => handleSelectModel(modelId)}
                                className="px-3 py-2.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="truncate">{modelId}</span>
                                  <ModalityIcons modelInfo={info} />
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>

                {!hasHardcodedModels && (!getApiKeyValue() || (!isManaged && !getBaseUrlValue())) ? (
                  <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                    {isManaged
                      ? 'Configure your API key to search models'
                      : 'Configure API key and base URL to search models'}
                  </p>
                ) : (
                  <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                    Search for models by name and select to add them to this provider
                  </p>
                )}
              </SettingsSection>

              {/* Selected Models */}
              {selectedProvider.models && selectedProvider.models.length > 0 && (
                <SettingsSection title={`Selected Models (${selectedProvider.models.length})`}>
                  <div className="space-y-2">
                    {selectedProvider.models.map((model) => {
                      const info = getModelInfo(selectedProvider.provider, model.id);
                      return (
                        <ModelListItem
                          key={model.id}
                          name={model.name || model.id}
                          onDelete={() => handleRemoveModel(model.id)}
                          rightSlot={
                            <div className="flex items-center gap-1">
                              <ModalityIcons modelInfo={info} />
                              <button
                                onClick={() => setModelSettingsTarget({ provider: selectedProvider.provider, modelId: model.id })}
                                className={`p-1.5 rounded-md ${COMPONENT.iconButtonSm} transition-all`}
                                title="Model settings"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                </SettingsSection>
              )}
            </>
          ) : (
            <div className={`flex items-center justify-center py-12 ${TEXT.faint} ${TYPOGRAPHY_CLASSES.settingsDescription}`}>
              Select a provider to configure
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Per-model settings modal */}
      {modelSettingsTarget && providers.find(p => p.provider === modelSettingsTarget.provider) && (() => {
        const targetProvider = providers.find(p => p.provider === modelSettingsTarget.provider)!;
        const targetModel = targetProvider.models?.find(m => m.id === modelSettingsTarget.modelId);
        if (!targetProvider || !targetModel) return null;

        const currentToolsEnabled = targetModel.toolsEnabled !== undefined
          ? targetModel.toolsEnabled
          : MANAGED_SDK_PROVIDERS.has(targetProvider.provider);

        return (
          <ModelSettingsModal
            open={!!modelSettingsTarget}
            onClose={() => setModelSettingsTarget(null)}
            providerName={targetProvider.provider}
            modelId={targetModel.id}
            toolsEnabled={currentToolsEnabled}
            onSave={(toolsEnabled) => {
              const updatedModels = (targetProvider.models || []).map(m =>
                m.id === targetModel.id ? { ...m, toolsEnabled } : m
              );
              updateProvider(targetProvider.provider, { models: updatedModels });
            }}
          />
        );
      })()}
    </div>
  );
};

export default ProvidersPanel;
