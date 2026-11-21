/** Chat model picker: the shared native model menu on a Mac; a searchable list with icons and chips on iPhone and iPad. */

import React, { useState, useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ModelChips, ModelIcon, ProvidersAvatar, openModelMenu } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { groupChoices, modelSources, type ModelChoice } from '@shared/utils/modelResolver';
import { jobChoices } from '@services/ai/models';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { Button, CommandPopover, CommandGroup, CommandRow, Dot, Icon, Text, Tooltip, cn } from '@shared/ui';
import { MODEL_PICKER_COPY } from '@config/chat.config';
import { MODEL_MENU_COPY } from '@config/modelMenu.config';
import { platform } from '@platform/index';
import { useLocalServerProbe } from '@features/settings/hooks';
import { useChatModel } from '@features/chat/hooks/useChatModel';
import { useChatModelLock } from '@features/chat/stores';

interface ModelPickerProps {
  /** Compact mode for inline display */
  compact?: boolean;
  /** The model's logo alone (a narrow composer); its name on hover and in the menu. */
  iconOnly?: boolean;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ compact = false, iconOnly = false }) => {
  const { providers, settings, setSettings, saveSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const catalogLoaded = useModelCatalog();
  // The shared local-server probe: keeps local models' server info current and says which model is loaded.
  const { data: servers } = useLocalServerProbe();
  const isLoaded = (provider: string, modelId: string) =>
    servers?.find((server) => server.id === provider)?.models.find((model) => model.id === modelId)?.loaded ?? false;

  // Chat models only (text in, text out), with the same layout as Settings › Default Models: usable by provider, then "Needs setup".
  const { data: localModels } = useLocalModels();
  const choices = useMemo(
    () => jobChoices(modelSources(providers, settings, localModels), 'chat'),
    // catalogLoaded: what models.dev says decides which models chat.
    [providers, settings, localModels, catalogLoaded],
  );
  const { groups, needsSetup } = useMemo(() => groupChoices(choices), [choices]);
  // The open chat's model (a chat keeps its first reply's), else the chat model setting.
  const chatModel = useChatModel();
  const locked = useChatModelLock();
  const selected = choices.find((c) => c.provider === chatModel?.provider && c.modelId === chatModel.modelId);

  const handleSelectModel = (modelId: string) => {
    setSettings({ chatModel: modelId });
    saveSettings({ chatModel: modelId });
    setOpen(false);
  };

  const hasModels = groups.length > 0;
  const trigger = (onClick?: React.MouseEventHandler<HTMLButtonElement>) => (
    <Button
      variant="ghost"
      size="toolbar"
      disabled={!hasModels || !!locked}
      title={locked ? undefined : iconOnly && selected ? selected.label : hasModels ? MODEL_PICKER_COPY.select : MODEL_PICKER_COPY.noModels}
      onClick={onClick}
    >
      {selected ? (
        <>
          <ModelIcon provider={selected.provider} modelId={selected.modelId} size={compact ? 14 : 16} />
          {!iconOnly && (
            <Text variant="label" tone="inherit" truncate className="max-w-32">
              {selected.label}
            </Text>
          )}
        </>
      ) : (
        <Text variant="label" tone="faint">
          {hasModels ? MODEL_PICKER_COPY.select : 'No models'}
        </Text>
      )}
      {!locked && <Icon icon={ChevronDown} size="xs" className={cn('transition-transform', open && 'rotate-180')} />}
    </Button>
  );

  // A chat that has answered keeps its model: the picker shows it, fixed; hovering says why (a disabled button gets no hover).
  if (locked) {
    return (
      <Tooltip content={MODEL_PICKER_COPY.locked}>
        <span className="inline-flex">{trigger()}</span>
      </Tooltip>
    );
  }

  // Mac: the shared native model menu (icons, grey facts line, checkmark). iPhone and iPad: the searchable list.
  if (platform.hasMenuBar) {
    const all = [...groups.flatMap(([, models]) => models), ...needsSetup];
    return trigger((e) => {
      const options = { selected: selected?.value ?? '', isLoaded: (c: ModelChoice) => isLoaded(c.provider, c.modelId), showAvatars: !!settings.showModelAvatars };
      openModelMenu(all, options, e.currentTarget.getBoundingClientRect())
        .then((chosen) => chosen && handleSelectModel(chosen))
        .catch((error: unknown) => console.error('[ModelPicker] menu failed:', error));
    });
  }

  return (
    <CommandPopover
      open={open}
      onOpenChange={setOpen}
      title="Model"
      searchPlaceholder="Search models…"
      emptyText="No models found"
      trigger={trigger()}
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
            const isSelected = model.provider === selected?.provider && model.modelId === selected.modelId;

            return (
              <CommandRow
                key={`${provider}-${model.value}`}
                value={`${model.label} ${getProviderTitle(model.provider)}`}
                onSelect={() => handleSelectModel(model.value)}
                leading={<ModelIcon provider={model.provider} modelId={model.modelId} size={14} fallback="none" />}
                label={model.label}
                // Capabilities sit in the row's meta column: one line, aligned down the list, never wrapping.
                meta={<ModelChips profile={model.profile} />}
                labelVariant={isSelected ? 'bodyStrong' : 'body'}
                status={isLoaded(model.provider, model.modelId) && (
                  <Tooltip content={MODEL_PICKER_COPY.loaded}>
                    <span aria-label={MODEL_PICKER_COPY.loaded} className="inline-flex"><Dot tone="success" size="xs" /></span>
                  </Tooltip>
                )}
                check={isSelected ? <Icon icon={Check} size="sm" tone="accent" /> : null}
              />
            );
          })}
        </CommandGroup>
      ))}
      {needsSetup.length > 0 && (
        <CommandGroup heading={MODEL_MENU_COPY.needsSetup}>
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
