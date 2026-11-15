/** Searchable chat model picker with provider icons, modality badges, and tool support. */

import React, { useState, useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ProvidersAvatar, ModelIcon } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { groupChoices, modelChoices } from '@shared/utils/modelResolver';
import { modelInfoOf } from '@services/ai/capabilities';
import { ModalityIcons } from '@features/settings/components/ModalityIcons';
import type { ModelInfo } from '@services/modalities';
import { Button, CommandPopover, CommandGroup, CommandRow, Dot, Icon, Text, Tooltip, cn } from '@shared/ui';
import { MODEL_PICKER_COPY } from '@config/chat.config';
import { useLocalServerProbe } from '@features/settings/hooks';

interface ModelPickerProps {
  /** Compact mode for inline display */
  compact?: boolean;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ compact = false }) => {
  const { providers, settings, setSettings, saveSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const catalogLoaded = useModelCatalog();
  // The shared local-server probe: keeps local models' server info current and says which model is loaded.
  const { data: servers } = useLocalServerProbe();
  const isLoaded = (provider: string, modelId: string) =>
    servers?.find((server) => server.id === provider)?.models.find((model) => model.id === modelId)?.loaded ?? false;

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
          size="toolbar"
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
            const info: ModelInfo | null = catalogLoaded
              ? modelInfoOf(model.provider, { id: model.modelId, served: model.served })
              : null;

            return (
              <CommandRow
                key={`${provider}-${model.value}`}
                value={`${model.label} ${getProviderTitle(model.provider)}`}
                onSelect={() => handleSelectModel(model.value)}
                leading={<ModelIcon provider={model.provider} modelId={model.modelId} size={14} fallback="none" />}
                label={model.label}
                labelVariant={isSelected ? 'bodyStrong' : 'body'}
                status={isLoaded(model.provider, model.modelId) && (
                  <Tooltip content={MODEL_PICKER_COPY.loaded}>
                    <span aria-label={MODEL_PICKER_COPY.loaded} className="inline-flex"><Dot tone="success" size="xs" /></span>
                  </Tooltip>
                )}
                meta={<ModalityIcons modelInfo={info} variant="compact" />}
                check={isSelected ? <Icon icon={Check} size="sm" tone="accent" /> : null}
              />
            );
          })}
        </CommandGroup>
      ))}
      {needsSetup.length > 0 && (
        <CommandGroup heading="Needs setup">
          {needsSetup.map((model) => (
            <CommandRow
              key={`setup-${model.provider}-${model.value}`}
              value={`${model.label} ${getProviderTitle(model.provider)}`}
              disabled
              leading={<ModelIcon provider={model.provider} modelId={model.modelId} size={14} />}
              label={model.label}
              description={model.hint}
            />
          ))}
        </CommandGroup>
      )}
    </CommandPopover>
  );
};

export default ModelPicker;
