/**
 * ModelPicker Component
 *
 * Dropdown picker for selecting AI chat model. Shows provider icons, model names,
 * modality badges, and tool support indicators.
 * Uses Radix Popover + cmdk Command for accessible search/selection.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import ProvidersAvatar from '@shared/components/ProvidersAvatar';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { resolveModel, supportsTools } from '@shared/utils/modelResolver';
import { modalitiesService } from '@services/modalities';
import { ModalityIcons } from '@features/settings/components/ModalityIcons';
import { MANAGED_SDK_PROVIDERS } from '@config/providers.config';
import type { ModelInfo } from '@services/modalities';
import { COMPONENT, SURFACE, TEXT } from '@config/theme.config';
import { CommandPopover, CommandGroup, CommandItem } from '@shared/ui';

interface ModelPickerProps {
  /** Compact mode for inline display */
  compact?: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  toolsEnabled: boolean;
}

/** Check if a model has tools enabled (without needing full ResolvedModel) */
function modelHasTools(provider: string, toolsEnabledFlag?: boolean): boolean {
  if (toolsEnabledFlag !== undefined) return toolsEnabledFlag;
  return MANAGED_SDK_PROVIDERS.has(provider);
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ compact = false }) => {
  const { providers, settings, setSettings, saveSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [modalitiesReady, setModalitiesReady] = useState(modalitiesService.isLoaded());

  // Ensure modalities data is loaded (guard completion after unmount)
  useEffect(() => {
    if (modalitiesReady) return;
    let cancelled = false;
    modalitiesService.ensureLoaded().then(() => {
      if (!cancelled) setModalitiesReady(true);
    });
    return () => { cancelled = true; };
  }, [modalitiesReady]);

  // Get all models from active providers, grouped by provider
  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, { provider: string; models: ModelOption[] }> = {};

    providers.forEach(provider => {
      if (provider.active && provider.models && provider.models.length > 0) {
        grouped[provider.provider] = {
          provider: provider.provider,
          models: provider.models.map(model => ({
            id: model.id,
            name: model.name || model.displayName || model.id,
            provider: provider.provider,
            toolsEnabled: modelHasTools(provider.provider, model.toolsEnabled),
          })),
        };
      }
    });

    return grouped;
  }, [providers]);

  // Flat list for finding selected model
  const allModels = useMemo(() => {
    const models: ModelOption[] = [];
    Object.values(modelsByProvider).forEach(group => {
      models.push(...group.models);
    });
    return models;
  }, [modelsByProvider]);

  // Get currently selected model info
  const selectedModel = useMemo(() => {
    if (!settings.chatModel) return null;
    return allModels.find(m => m.id === settings.chatModel) || {
      id: settings.chatModel,
      name: settings.chatModel,
      provider: 'unknown',
      toolsEnabled: false,
    };
  }, [settings.chatModel, allModels]);

  const handleSelectModel = (modelId: string) => {
    setSettings({ chatModel: modelId });
    saveSettings({ chatModel: modelId });
    setOpen(false);

    // Persist last-used model for auto-restore on next launch
    const model = allModels.find(m => m.id === modelId);
    if (model) {
      try {
        localStorage.setItem('kasset_last_used_model', JSON.stringify({
          provider: model.provider,
          modelId: model.id,
        }));
      } catch {
        // localStorage not available — ignore
      }
    }
  };

  // Check if current model supports tool calling (for trigger display)
  const selectedToolsEnabled = useMemo(() => {
    const resolved = resolveModel(settings.chatModel, providers);
    return resolved ? supportsTools(resolved) : false;
  }, [settings.chatModel, providers]);

  const hasModels = allModels.length > 0;

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder="Search models..."
      emptyText="No models found"
      trigger={
        <button
          disabled={!hasModels}
          className={`${COMPONENT.composerPickerTrigger} ${
            hasModels
              ? `${SURFACE.hoverSubtle} ${TEXT.secondary}`
              : `${TEXT.faint} cursor-not-allowed`
          } ${compact ? 'text-xs' : 'text-sm'}`}
          title={hasModels ? 'Select model' : 'No models available - configure providers first'}
        >
          {selectedModel ? (
            <>
              <ProvidersAvatar provider={selectedModel.provider} size={compact ? 14 : 16} />
              <span className="max-w-[120px] truncate font-medium">
                {selectedModel.name}
              </span>
              {selectedToolsEnabled && (
                <span title="Meeting tools available" className="flex-shrink-0 flex items-center">
                  <Wrench className={`w-3 h-3 ${TEXT.faint}`} />
                </span>
              )}
            </>
          ) : (
            <span className={TEXT.faint}>
              {hasModels ? 'Select model' : 'No models'}
            </span>
          )}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      }
    >
      {Object.values(modelsByProvider).map(group => (
        <CommandGroup
          key={group.provider}
          heading={
            <div className="flex items-center gap-2">
              <ProvidersAvatar provider={group.provider} size={14} />
              <span>{getProviderTitle(group.provider)}</span>
            </div>
          }
        >
          {group.models.map(model => {
            const isSelected = settings.chatModel === model.id;
            const info: ModelInfo | null = modalitiesReady
              ? modalitiesService.getModelInfo(model.provider, model.id)
              : null;

            return (
              <CommandItem
                key={`${group.provider}-${model.id}`}
                value={`${model.name} ${getProviderTitle(model.provider)}`}
                onSelect={() => handleSelectModel(model.id)}
                className={isSelected
                  ? 'ring-1 ring-violet-500 dark:ring-violet-400 bg-violet-50 dark:bg-violet-500/10'
                  : ''
                }
              >
                <span className={`flex-1 truncate ${isSelected ? 'font-medium text-violet-700 dark:text-violet-300' : ''}`}>
                  {model.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <ModalityIcons modelInfo={info} variant="compact" />
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      ))}
    </CommandPopover>
  );
};

export default ModelPicker;
