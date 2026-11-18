/** Chat model picker: the system menu on a Mac (logo headers, short capability text); a searchable list with icons and chips elsewhere. */

import React, { useState, useMemo } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ModelChips, ModelIcon, ProvidersAvatar } from '@shared/components';
import { nativeMenu, type NativeMenuEntry } from '@services/tauri';
import { cachedImage } from '@services/imageCache';
import { getAvatarUrl, modelAvatarOrg } from '@services/modelAvatars';
import { getProviderLogo, getProviderTitle } from '@shared/utils/provider.utils';
import { groupChoices, modelSources, type ModelChoice } from '@shared/utils/modelResolver';
import { jobChoices } from '@services/ai/models';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { Button, CommandPopover, CommandGroup, CommandRow, Dot, Icon, Text, Tooltip, cn } from '@shared/ui';
import { MODEL_PICKER_COPY } from '@config/chat.config';
import { META_SEPARATOR, MENU_GAP_PT } from '@config/ui.config';
import { platform } from '@platform/index';
import { useLocalServerProbe } from '@features/settings/hooks';

/** A menu row's grey second line: what it takes in, what it can do, whether it's loaded; empty when none apply. */
export function rowFacts(choice: ModelChoice, loaded: boolean): string {
  const { marks } = MODEL_PICKER_COPY;
  const info = choice.info;
  return [
    info?.modalities?.input.includes('image') && marks.vision,
    info?.modalities?.input.includes('audio') && marks.audio,
    info?.capabilities.toolCall && marks.tools,
    info?.capabilities.reasoning && marks.thinking,
    loaded && marks.loaded,
  ].filter(Boolean).join(META_SEPARATOR);
}

/** A menu row's icon as ModelIcon draws it: the maker's avatar when shown and known, else the provider's logo. */
async function iconUrlOf(choice: ModelChoice, showAvatars: boolean): Promise<string | null> {
  const logo = getProviderLogo(choice.provider) ?? null;
  const org = modelAvatarOrg(choice.provider, choice.modelId, showAvatars);
  return org ? cachedImage(getAvatarUrl(org)).catch(() => logo) : logo;
}

/** The Mac menu: a header per provider, its models (icon, name, facts as subtext; the chosen one checked), then the ones that need setup. */
export function modelMenu(
  groups: Array<[string, ModelChoice[]]>,
  needsSetup: ModelChoice[],
  selected: string | undefined,
  isLoaded: (provider: string, modelId: string) => boolean,
  iconOf: (choice: ModelChoice) => string | null,
): NativeMenuEntry[] {
  const entries: NativeMenuEntry[] = groups.flatMap(([provider, models], i): NativeMenuEntry[] => [
    ...(i > 0 ? [{ kind: 'separator' as const }] : []),
    { kind: 'header', title: getProviderTitle(provider) },
    ...models.map((m): NativeMenuEntry => ({
      kind: 'row', id: m.value, title: m.label, subtitle: rowFacts(m, isLoaded(m.provider, m.modelId)), icon: iconOf(m), checked: m.value === selected, enabled: true,
    })),
  ]);
  if (needsSetup.length === 0) return entries;
  return [
    ...entries,
    { kind: 'separator' },
    { kind: 'header', title: MODEL_PICKER_COPY.needsSetup },
    ...needsSetup.map((m): NativeMenuEntry => ({ kind: 'row', id: m.value, title: m.label, subtitle: m.hint ?? undefined, icon: iconOf(m), enabled: false })),
  ];
}

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

  // Chat models only (text in, text out), with the same layout as Settings › Default Models: usable by provider, then "Needs setup".
  const { data: localModels } = useLocalModels();
  const choices = useMemo(
    () => jobChoices(modelSources(providers, settings, localModels), 'chat'),
    // catalogLoaded: what models.dev says decides which models chat.
    [providers, settings, localModels, catalogLoaded],
  );
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
        localStorage.setItem('roci_last_used_model', JSON.stringify({
          provider: model.provider,
          modelId: model.modelId,
        }));
      } catch {
        // localStorage not available — ignore
      }
    }
  };

  const hasModels = groups.length > 0;
  const trigger = (onClick?: React.MouseEventHandler<HTMLButtonElement>) => (
    <Button
      variant="ghost"
      size="toolbar"
      disabled={!hasModels}
      title={hasModels ? 'Select model' : 'No models available - configure providers first'}
      onClick={onClick}
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
  );

  // Mac: the system menu (provider headers; each model with its icon, short facts and a checkmark). iPhone and iPad: the searchable list.
  if (platform.hasMenuBar) {
    const showMenu = async (at: DOMRect) => {
      const all = [...groups.flatMap(([, models]) => models), ...needsSetup];
      const urls = new Map(await Promise.all(all.map(async (c) => [c.value, await iconUrlOf(c, !!settings.showModelAvatars)] as const)));
      const entries = modelMenu(groups, needsSetup, settings.chatModel, isLoaded, (c) => urls.get(c.value) ?? null);
      const { chosen } = await nativeMenu(entries, at.left, at.bottom + MENU_GAP_PT);
      if (chosen) handleSelectModel(chosen);
    };
    return trigger((e) => {
      showMenu(e.currentTarget.getBoundingClientRect()).catch((error: unknown) => console.error('[ModelPicker] menu failed:', error));
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
            const isSelected = settings.chatModel === model.value;

            return (
              <CommandRow
                key={`${provider}-${model.value}`}
                value={`${model.label} ${getProviderTitle(model.provider)}`}
                onSelect={() => handleSelectModel(model.value)}
                leading={<ModelIcon provider={model.provider} modelId={model.modelId} size={14} fallback="none" />}
                label={model.label}
                // Capabilities sit in the row's meta column: one line, aligned down the list, never wrapping.
                meta={<ModelChips info={model.info} />}
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
        <CommandGroup heading={MODEL_PICKER_COPY.needsSetup}>
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
