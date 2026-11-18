/** Settings › Providers › Models: the provider's saved models, and (cloud) adding one from the provider's model list. */

import React, { useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { openUrl } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ModelIcon, ModelLabel, RenameModal, ModelChips } from '@shared/components';
import { capabilitiesOf, modelInfoOf } from '@services/ai/capabilities';
import { confirm } from '@shared/stores/confirmStore';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { CardRow, CommandGroup, CommandPopover, CommandRow, ICON_TILE_PX, Icon, Section } from '@shared/ui';
import type { Model, ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection } from '@features/settings/hooks/useProviderConnection';
import { hasInfo } from '@services/providers/listing';
import type { ListedModel } from '@services/providers/listing';
import { ModelRowMenu } from './ModelRowMenu';
import type { ModelCapabilityFlag } from './ModelRowMenu';

interface ProviderModelsProps {
  provider: ModelProvider;
  /** Loads the model list Add searches; absent for local servers, which sync their own models. */
  connection?: ProviderConnection;
}

interface AddModelPickerProps {
  provider: string;
  connection: ProviderConnection;
  added: ReadonlySet<string>;
  onAdd: (model: ListedModel) => void;
}

/** What the list says while it has no rows to show. */
function emptyText(status: ConnectionStatus): string {
  if (status.state === 'checking') return 'Loading models…';
  if (status.state === 'failed') return status.message;
  return 'No models found';
}

/**
 * "Add model" on the Models label: opening it loads the provider's model list (or reuses Test's); a name the list
 * lacks, or any name when the list can't load, can be added as typed.
 */
const AddModelPicker: React.FC<AddModelPickerProps> = ({ provider, connection, added, onAdd }) => {
  const catalogLoaded = useModelCatalog();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { status } = connection;
  const available = status.state === 'connected' ? status.models : [];
  const typed = search.trim();
  const unlisted = typed !== '' && !added.has(typed) && !available.some((m) => m.id === typed);

  const changeOpen = (next: boolean) => {
    setPickerOpen(next);
    if (!next) setSearch('');
    if (next && (status.state === 'untested' || status.state === 'failed')) connection.test();
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
      title="Add Model"
      searchPlaceholder="Search models…"
      emptyText={emptyText(status)}
      side="bottom"
      align="end"
      avoidCollisions={false}
      trigger={<CardRow role="button" tabIndex={0} title="Add Model" tone="accent" className="cursor-pointer" />}
    >
      {unlisted && (
        <CommandGroup heading="Not in the provider's list">
          <CommandRow value={typed} onSelect={() => add({ id: typed, info: {} })} leading={<Icon icon={Plus} size="sm" tone="faint" />} label={`Add “${typed}”`} />
        </CommandGroup>
      )}
      {available.filter((model) => !added.has(model.id)).map((model) => (
        <CommandRow
          key={model.id}
          value={model.id}
          onSelect={() => add(model)}
          label={model.id}
          meta={<ModelChips info={catalogLoaded ? modelInfoOf(provider, { id: model.id }) : null} />}
        />
      ))}
    </CommandPopover>
  );
};

export const ProviderModels: React.FC<ProviderModelsProps> = ({ provider, connection }) => {
  const { updateProvider } = useSettings();
  const [renaming, setRenaming] = useState<Model | null>(null);
  const catalogLoaded = useModelCatalog();
  const models = provider.models ?? [];
  const id = provider.provider;

  const canAdd = !!connection && connection.status.state !== 'incomplete';
  if (models.length === 0 && !canAdd) return null;

  const setModels = (next: Model[]) => updateProvider(id, { models: next });

  const handleAdd = ({ id: modelId, info }: ListedModel) => {
    if (models.some((m) => m.id === modelId)) return;
    setModels([...models, { id: modelId, name: modelId, ...(hasInfo(info) ? { listed: info } : {}) }]);
  };

  const handleRemove = async (model: Model) => {
    const confirmed = await confirm({
      title: `Remove ${getModelDisplayName(model)}?`,
      description: 'It leaves your model pickers. You can add it again any time.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (confirmed) setModels(models.filter((m) => m.id !== model.id));
  };

  /** An empty name clears the rename back to the model's id. */
  const handleRename = (modelId: string, name: string) =>
    setModels(models.map((m) => (m.id === modelId ? { ...m, displayName: name || undefined } : m)));

  /** One per-model capability override (Tool calling, Audio input). */
  const handleFlag = (modelId: string, flag: ModelCapabilityFlag, value: boolean) =>
    setModels(models.map((m) => (m.id === modelId ? { ...m, [flag]: value } : m)));

  const exploreUrl = provider.explore_models_url;

  return (
    <>
      <Section
        title="Models"
        footer="Models you add here appear in Roci’s model pickers."
      >
        {models.map((model) => (
          <CardRow
            key={model.id}
            leading={<ModelIcon provider={id} modelId={model.id} size={ICON_TILE_PX} />}
            title={<ModelLabel name={getModelDisplayName(model)} info={catalogLoaded ? modelInfoOf(id, model) : null} />}
            actions={
              <ModelRowMenu
                capabilities={capabilitiesOf(id, model)}
                onFlagChange={(flag, value) => handleFlag(model.id, flag, value)}
                onRename={() => setRenaming(model)}
                onRemove={() => void handleRemove(model)}
              />
            }
          />
        ))}
        {/* Actions end the list as tinted rows (iOS), not links on the header. */}
        {canAdd && <AddModelPicker provider={id} connection={connection} added={new Set(models.map((m) => m.id))} onAdd={handleAdd} />}
        {exploreUrl && (
          <CardRow title="Browse Models" tone="accent" onPress={() => void openUrl(exploreUrl)} actions={<Icon icon={ExternalLink} size="sm" tone="accent" />} />
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
