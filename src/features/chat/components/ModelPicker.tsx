/**
 * ModelPicker Component
 *
 * Dropdown picker for selecting AI chat model. Shows provider icons, model names,
 * modality badges, and tool support indicators.
 * Uses Radix Popover + cmdk Command for accessible search/selection.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ProvidersAvatar, ModelIcon } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { groupChoices, modelChoices } from '@shared/utils/modelResolver';
import { modalitiesService } from '@services/modalities';
import { ModalityIcons } from '@features/settings/components/ModalityIcons';
import type { ModelInfo } from '@services/modalities';
import { Button, CommandPopover, CommandGroup, CommandItem, Icon, Text, cn } from '@shared/ui';

interface ModelPickerProps {
  /** Compact mode for inline display */
  compact?: boolean;
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

  // The same catalog and layout as Settings › Capabilities: usable models by provider, then "Needs setup".
  const choices = useMemo(() => modelChoices(providers), [providers]);
  const { groups, needsSetup } = useMemo(() => groupChoices(choices), [choices]);
  const selected = choices.find((c) => c.value === settings.chatModel);

  const handleSelectModel = (modelId: string) => {
    setSettings({ chatModel: modelId });
    saveSettings({ chatModel: modelId });
    setOpen(false);

    // Persist last-used model for auto-restore on next launch
    const model = choices.find((c) => c.value === modelId);
    if (model) {
      try {
        localStorage.setItem('kasset_last_used_model', JSON.stringify({
          provider: model.provider,
          modelId: model.modelId,
        }));
      } catch {
        // localStorage not available — ignore
      }
    }
  };

  const hasModels = groups.length > 0;

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      searchPlaceholder="Search models..."
      emptyText="No models found"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasModels}
          title={hasModels ? 'Select model' : 'No models available - configure providers first'}
        >
          {selected ? (
            <>
              <ModelIcon provider={selected.provider} modelId={selected.modelId} size={compact ? 14 : 16} />
              <Text variant="label" tone="inherit" truncate className="max-w-32">
                {selected.label}
              </Text>
            </>
          ) : (
            <Text variant="label" tone="faint">
              {hasModels ? 'Select model' : 'No models'}
            </Text>
          )}
          <Icon icon={ChevronDown} size="xs" className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      }
    >
      {groups.map(([provider, models]) => (
        <CommandGroup
          key={provider}
          heading={
            <div className="flex items-center gap-2">
              <ProvidersAvatar provider={provider} size={14} />
              <span>{getProviderTitle(provider)}</span>
            </div>
          }
        >
          {models.map((model) => {
            const isSelected = settings.chatModel === model.value;
            const info: ModelInfo | null = modalitiesReady
              ? modalitiesService.getModelInfo(model.provider, model.modelId)
              : null;

            return (
              <CommandItem
                key={`${provider}-${model.value}`}
                value={`${model.label} ${getProviderTitle(model.provider)}`}
                onSelect={() => handleSelectModel(model.value)}
              >
                <ModelIcon provider={model.provider} modelId={model.modelId} size={14} fallback="none" />
                <Text variant={isSelected ? 'bodyStrong' : 'body'} truncate className="flex-1">
                  {model.label}
                </Text>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <ModalityIcons modelInfo={info} variant="compact" />
                </div>
                {isSelected && <Icon icon={Check} size="sm" tone="accent" className="shrink-0" />}
              </CommandItem>
            );
          })}
        </CommandGroup>
      ))}
      {needsSetup.length > 0 && (
        <CommandGroup heading="Needs setup">
          {needsSetup.map((model) => (
            <CommandItem key={`setup-${model.provider}-${model.value}`} value={`${model.label} ${getProviderTitle(model.provider)}`} disabled>
              <ModelIcon provider={model.provider} modelId={model.modelId} size={14} />
              <span className="flex flex-col min-w-0 flex-1">
                <Text truncate>{model.label}</Text>
                <Text variant="helper" tone="faint" truncate>{model.hint}</Text>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandPopover>
  );
};

export default ModelPicker;
