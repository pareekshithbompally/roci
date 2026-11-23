/** Settings › Providers › Models: the provider's saved models, and (cloud) adding one from the provider's model list. */

import React, { useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { openUrl } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ModelIcon, ModelLabel, RenameModal, ModelChips } from '@shared/components';
import { isEmptyReport, profileOf, shownProfile } from '@services/ai/models';
import { modalitiesService } from '@services/modalities';
import type { ListedModel } from '@services/ai/models';
import { confirm } from '@shared/stores/confirmStore';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { CardRow, CommandGroup, CommandPopover, CommandRow, ICON_TILE_PX, Icon, Section } from '@shared/ui';
import type { Model, ModelOverrides, ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection } from '@features/settings/hooks/useProviderConnection';
import { ModelRowMenu } from './ModelRowMenu';
import { PROVIDER_COPY as COPY } from '@config/settingsCopy.config';

interface ProviderModelsProps {
  provider: ModelProvider;
  /** Loads the model list Add searches; absent for local servers, which sync their own models. */
  connection?: ProviderConnection;
  /** No model list to load (speech-only providers): Add offers the seeded models, or takes a name as typed. */
  addByName?: boolean;
}

interface AddModelPickerProps {
  provider: string;
  /** Absent: nothing to load; the seeded models are offered, and any name can be added as typed. */
  connection?: ProviderConnection;
  added: ReadonlySet<string>;
  onAdd: (model: ListedModel) => void;
}

/** What the list says while it has no rows to show. */
function emptyText(status: ConnectionStatus | undefined): string {
  if (!status) return COPY.typeName;
  if (status.state === 'checking') return COPY.loadingModels;
  if (status.state === 'failed') return status.message;
  return COPY.noModels;
}

/**
 * "Add model" on the Models label: opening it loads the provider's model list (or reuses Test's); a name the list
 * lacks, or any name when the list can't load or there is none, can be added as typed.
 */
const AddModelPicker: React.FC<AddModelPickerProps> = ({ provider, connection, added, onAdd }) => {
  // Re-renders when the catalog arrives, so its facts join what the provider reported.
  useModelCatalog();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const status = connection?.status;
  const available = connection ? (status?.state === 'connected' ? status.models : []) : modalitiesService.seededModels(provider);
  const typed = search.trim();
  const unlisted = typed !== '' && !added.has(typed) && !available.some((m) => m.id === typed);

  const changeOpen = (next: boolean) => {
    setPickerOpen(next);
    if (!next) setSearch('');
    // the list is only in hand after a test this session; an earlier session's result is just its outcome
    if (next && (status?.state === 'untested' || status?.state === 'failed' || status?.state === 'checked')) connection?.test();
  };

  const add = (model: ListedModel) => {
    onAdd(model);
    changeOpen(false);
  };

  return (
    <CommandPopover
      open={pickerOpen}
      onOpenChange={changeOpen}
      search={search}
      onSearchChange={setSearch}
      title={COPY.addModel}
      searchPlaceholder={COPY.searchModels}
      emptyText={emptyText(status)}
      side="bottom"
      align="end"
      avoidCollisions={false}
      trigger={<CardRow role="button" tabIndex={0} title={COPY.addModel} tone="accent" className="cursor-pointer" />}
    >
      {unlisted && (
        <CommandGroup heading={connection ? COPY.notInList : undefined}>
          <CommandRow value={typed} onSelect={() => add({ id: typed, report: {} })} leading={<Icon icon={Plus} size="sm" tone="faint" />} label={COPY.addTyped(typed)} />
        </CommandGroup>
      )}
      {available.filter((model) => !added.has(model.id)).map((model) => (
        <CommandRow
          key={model.id}
          value={model.id}
          onSelect={() => add(model)}
          label={model.id}
          meta={<ModelChips profile={shownProfile(profileOf(provider, { id: model.id, reported: model.report }))} />}
        />
      ))}
    </CommandPopover>
  );
};

export const ProviderModels: React.FC<ProviderModelsProps> = ({ provider, connection, addByName = false }) => {
  const { updateProvider } = useSettings();
  const [renaming, setRenaming] = useState<Model | null>(null);
  // Re-renders when the catalog arrives, so its facts join what the provider reported.
  useModelCatalog();
  const models = provider.models ?? [];
  const id = provider.provider;

  const canAdd = addByName || (!!connection && connection.status.state !== 'incomplete');
  if (models.length === 0 && !canAdd) return null;

  const setModels = (next: Model[]) => updateProvider(id, { models: next });

  const handleAdd = ({ id: modelId, report }: ListedModel) => {
    if (models.some((m) => m.id === modelId)) return;
    setModels([...models, { id: modelId, name: modelId, ...(!isEmptyReport(report) && { reported: report }) }]);
  };

  const handleRemove = async (model: Model) => {
    const confirmed = await confirm({
      ...COPY.removeConfirm(getModelDisplayName(model)),
      tone: 'danger',
    });
    if (confirmed) setModels(models.filter((m) => m.id !== model.id));
  };

  /** An empty name clears the rename back to the model's id. */
  const handleRename = (modelId: string, name: string) =>
    setModels(models.map((m) => (m.id === modelId ? { ...m, displayName: name || undefined } : m)));

  /** One correction from the model's ⋯ menu, kept with its earlier ones. */
  const handleOverride = (modelId: string, override: ModelOverrides) =>
    setModels(models.map((m) => (m.id === modelId ? { ...m, overrides: { ...m.overrides, ...override } } : m)));

  const exploreUrl = provider.explore_models_url;

  return (
    <>
      <Section
        title={COPY.models}
        footer={COPY.modelsFooter}
      >
        {models.map((model) => (
          <CardRow
            key={model.id}
            leading={<ModelIcon provider={id} modelId={model.id} size={ICON_TILE_PX} />}
            title={<ModelLabel name={getModelDisplayName(model)} profile={shownProfile(profileOf(id, model))} />}
            actions={
              <ModelRowMenu
                profile={profileOf(id, model)}
                onOverride={(override) => handleOverride(model.id, override)}
                onRename={() => setRenaming(model)}
                onRemove={() => void handleRemove(model)}
              />
            }
          />
        ))}
        {/* Actions end the list as tinted rows (iOS), not links on the header. */}
        {canAdd && <AddModelPicker provider={id} connection={connection} added={new Set(models.map((m) => m.id))} onAdd={handleAdd} />}
        {exploreUrl && (
          <CardRow title={COPY.browseModels} tone="accent" onPress={() => void openUrl(exploreUrl)} actions={<Icon icon={ExternalLink} size="sm" tone="accent" />} />
        )}
      </Section>
      <RenameModal
        open={renaming !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setRenaming(null); }}
        currentTitle={renaming?.displayName ?? ''}
        placeholder={renaming?.id}
        clearable
        onConfirm={(name) => renaming && handleRename(renaming.id, name)}
      />
    </>
  );
};
