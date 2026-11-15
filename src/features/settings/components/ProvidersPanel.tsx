/** Master-detail providers layout; selectedProviderName is the source of truth, localStorage seeds first mount. */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Search, Loader2, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { getProviderTitle, isLocalProviderId } from '@shared/utils/provider.utils';
import { LOCAL_SERVER_INFO } from '@config/localServers.config';
import { providersService } from '@services/providers';
import { ModelIcon } from '@shared/components';
import { modalitiesService } from '@services/modalities';
import { capabilitiesOf } from '@services/ai/capabilities';
import { getManagedSDKInfo, getDefaultBaseUrl } from '@shared/utils/modelResolver';
import { MANAGED_MODELS, MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import { ModalityIcons } from './ModalityIcons';
import { ModelRowMenu } from './ModelRowMenu';
import type { ModelCapabilityFlag } from './ModelRowMenu';
import { confirm } from '@shared/stores/confirmStore';
import { ProviderGroup, ProviderListItem } from './ProviderListItem';
import { LocalServersSection } from './LocalServersSection';
import { SettingsInput, SecretInput, SettingsPage } from './shared';
import { Button, Callout, CardRow, Icon, IconButton, Popover, PopoverAnchor, PopoverContent, ScrollArea, Section, Surface, Text } from '@shared/ui';
import { Command, CommandList, CommandItem, CommandEmpty } from '@shared/ui';
import type { Model as ProviderModel, ModelProvider } from '@shared/types/modelProviders';
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
  const modalitiesLoaded = useModelCatalog();
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

  const [modelSearch, setModelSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const cloudProviders = providers.filter(p => !isLocalProviderId(p.provider));

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

    if (searchDisabled) return;

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
      showToast(`Couldn’t load models from ${getProviderTitle(providerName)}`, 'error');
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

  const handleRemoveModel = async (model: ProviderModel) => {
    if (!selectedProvider) return;
    const confirmed = await confirm({
      title: `Remove ${model.name || model.id}?`,
      description: 'It leaves your model pickers. You can add it again any time.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    updateProvider(selectedProvider.provider, {
      models: (selectedProvider.models || []).filter(m => m.id !== model.id)
    });
  };

  /** Writes one per-model capability override (Tool calling, Audio input). */
  const handleModelFlagChange = (modelId: string, flag: ModelCapabilityFlag, value: boolean) => {
    if (!selectedProvider) return;
    updateProvider(selectedProvider.provider, {
      models: (selectedProvider.models || []).map(m => (m.id === modelId ? { ...m, [flag]: value } : m)),
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

  const searchDisabled = !hasHardcodedModels && (!getApiKeyValue() || (!isManaged && !getBaseUrlValue()));

  return (
    <SettingsPage
      title="Model Providers"
      description="Enable providers and configure API keys to access AI models."
      layout="fill"
    >
      <div className="flex min-h-0 w-full gap-6">
        {/* Left: Provider list — independent scroll */}
        <ScrollArea className="w-56 shrink-0 space-y-4">
          <ProviderGroup title="Cloud">
            {cloudProviders.map((provider) => (
              <ProviderListItem
                key={provider.provider}
                provider={provider.provider}
                selected={effectiveSelectedProvider === provider.provider}
                active={provider.active}
                onSelect={() => handleSelectProvider(provider.provider)}
                onToggle={(checked) => updateProvider(provider.provider, { active: checked })}
              />
            ))}
          </ProviderGroup>
          <LocalServersSection
            selectedProvider={effectiveSelectedProvider}
            onSelect={handleSelectProvider}
          />
        </ScrollArea>

        {/* Right: Detail panel — independent scroll */}
        <ScrollArea className="flex-1 min-w-0 space-y-6">
          {selectedProvider ? (
            <>
              {showSetupBanner && !anyProviderHasModels && (
                <div className="relative">
                  <Callout variant="info">
                    <strong>Quick setup:</strong> Pick a provider on the left, enter your API key, and add at least one model — changes save automatically.
                  </Callout>
                  <IconButton
                    icon={X}
                    label="Dismiss"
                    size="sm"
                    onClick={() => setShowSetupBanner(false)}
                    className="absolute top-2 right-2"
                  />
                </div>
              )}

              {(() => {
                if (isLocalProviderId(selectedProvider.provider)) {
                  return <Callout variant="info">{LOCAL_SERVER_INFO}</Callout>;
                }
                const sdkInfo = getManagedSDKInfo(selectedProvider.provider);
                if (sdkInfo) {
                  return <Callout variant="info">{sdkInfo}</Callout>;
                }
                return (
                  <Callout variant="neutral">
                    Connects via the OpenAI-compatible Chat Completions endpoint
                  </Callout>
                );
              })()}

              <Section title={`${getProviderTitle(selectedProvider.provider)} Configuration`}>
                <div className="py-3 space-y-4">
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
                    <Button
                      variant="link"
                      size="inline"
                      onClick={() => {
                        open(selectedProvider.explore_models_url!).catch(err => {
                          console.error('[ProvidersPanel] Failed to open URL:', err);
                          window.open(selectedProvider.explore_models_url, '_blank', 'noopener,noreferrer');
                        });
                      }}
                    >
                      <Icon icon={ExternalLink} size="xs" />
                      Explore available models
                    </Button>
                  )}
                </div>
              </Section>

              {/* Add Models */}
              <Section title="Add Models">
                <div className="py-3 space-y-2">
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
                            disabled={searchDisabled}
                            helper={searchDisabled ? (isManaged ? 'Add your API key above to search models.' : 'Add your API key and base URL above to search models.') : undefined}
                            icon={Search}
                          />
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSearchModels}
                          disabled={isSearching || searchDisabled}
                        >
                          {isSearching && <Icon icon={Loader2} size="sm" className="animate-spin" />}
                          {isSearching ? 'Searching...' : 'Search'}
                        </Button>
                      </div>
                    </PopoverAnchor>

                    {searchResults.length > 0 && (
                      <PopoverContent
                        side="bottom"
                        sideOffset={8}
                        align="start"
                        width="trigger"
                        className="p-0"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Command>
                          <CommandList className="max-h-64">
                            <CommandEmpty>No models found</CommandEmpty>
                            {searchResults.length === 1 && searchResults[0] === modelSearch.trim() && (
                              <Surface edge="bottom" className="px-3 py-2">
                                <Text variant="helper" tone="faint">
                                  {hasHardcodedModels ? 'Not in known models — add manually:' : 'Not found via API — add manually:'}
                                </Text>
                              </Surface>
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

                  <Text as="p" variant="helper" tone="faint">
                    {!searchDisabled
                      ? 'Search for models by name and select to add them to this provider'
                      : isManaged
                        ? 'Configure your API key to search models'
                        : 'Configure API key and base URL to search models'}
                  </Text>
                </div>
              </Section>

              {/* Selected Models */}
              {selectedProvider.models && selectedProvider.models.length > 0 && (
                <Section title={`Selected Models (${selectedProvider.models.length})`}>
                  {selectedProvider.models.map((model) => (
                    <CardRow
                      key={model.id}
                      leading={<ModelIcon provider={selectedProvider.provider} modelId={model.id} size={20} fallback="none" />}
                      title={<span className="block truncate">{model.name || model.id}</span>}
                      actions={
                        <>
                          <ModalityIcons modelInfo={getModelInfo(selectedProvider.provider, model.id)} />
                          <ModelRowMenu
                            capabilities={capabilitiesOf(selectedProvider.provider, model)}
                            onFlagChange={(flag, value) => handleModelFlagChange(model.id, flag, value)}
                            onRemove={() => void handleRemoveModel(model)}
                          />
                        </>
                      }
                    />
                  ))}
                </Section>
              )}
            </>
          ) : (
            <Text as="div" tone="faint" className="flex items-center justify-center py-12">
              Select a provider to configure
            </Text>
          )}
        </ScrollArea>
      </div>
    </SettingsPage>
  );
};

export default ProvidersPanel;
