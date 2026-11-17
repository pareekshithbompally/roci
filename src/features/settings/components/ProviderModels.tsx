/** Settings › Providers › Models: the provider's saved models, and (cloud) adding one from the provider's model list. */

import React, { useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { openUrl } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { ModelIcon, RenameModal } from '@shared/components';
import { capabilitiesOf, modelInfoOf } from '@services/ai/capabilities';
import { confirm } from '@shared/stores/confirmStore';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { Button, CardRow, CommandGroup, CommandPopover, CommandRow, Icon, Section } from '@shared/ui';
import type { Model, ModelProvider } from '@shared/types/modelProviders';
import type { ConnectionStatus, ProviderConnection } from '@features/settings/hooks/useProviderConnection';
import { ModalityIcons } from './ModalityIcons';
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
  onAdd: (modelId: string) => void;
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
  const available = status.state === 'connected' ? status.modelIds : [];
  const typed = search.trim();
  const unlisted = typed !== '' && !added.has(typed) && !available.includes(typed);

  const changeOpen = (next: boolean) => {
    setPickerOpen(next);
    if (!next) setSearch('');
    if (next && (status.state === 'untested' || status.state === 'failed')) connection.test();
  };

  const add = (modelId: string) => {
    onAdd(modelId);
    changeOpen(false);
  };

  return (
    <CommandPopover
      open={pickerOpen}
      onOpenChange={changeOpen}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search models…"
      emptyText={emptyText(status)}
      side="bottom"
      align="end"
      avoidCollisions={false}
      trigger={
        <Button variant="link" size="inline">
          <Icon icon={Plus} size="xs" />
          Add model
        </Button>
      }
    >
      {unlisted && (
        <CommandGroup heading="Not in the provider's list">
          <CommandRow value={typed} onSelect={() => add(typed)} leading={<Icon icon={Plus} size="sm" tone="faint" />} label={`Add “${typed}”`} />
        </CommandGroup>
      )}
      {available.filter((modelId) => !added.has(modelId)).map((modelId) => (
        <CommandRow
          key={modelId}
          value={modelId}
          onSelect={() => add(modelId)}
          label={modelId}
          meta={<ModalityIcons modelInfo={catalogLoaded ? modelInfoOf(provider, { id: modelId }) : null} variant="compact" />}
        />
      ))}
    </CommandPopover>
  );
};

export const ProviderModels: React.FC<ProviderModelsProps> = ({ provider, connection }) => {
  const { updateProvider } = useSettings();
  const catalogLoaded = useModelCatalog();
  const [renaming, setRenaming] = useState<Model | null>(null);
  const models = provider.models ?? [];
  const id = provider.provider;

  const canAdd = !!connection && connection.status.state !== 'incomplete';
  if (models.length === 0 && !canAdd) return null;

  const setModels = (next: Model[]) => updateProvider(id, { models: next });

  const handleAdd = (modelId: string) => {
    if (models.some((m) => m.id === modelId)) return;
    setModels([...models, { id: modelId, name: modelId }]);
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

  const browse = provider.explore_models_url && (
    <Button
      variant="link"
      size="inline"
      onClick={() => void openUrl(provider.explore_models_url!)}
    >
      Browse models
      <Icon icon={ExternalLink} size="xs" />
    </Button>
  );

  return (
    <>
      <Section
        title={`Models · ${models.length}`}
        footer={models.length === 0 ? 'Add a model to use it in Roci’s model pickers.' : undefined}
        accessory={
          <span className="flex items-center gap-4">
            {browse}
            {canAdd && <AddModelPicker provider={id} connection={connection} added={new Set(models.map((m) => m.id))} onAdd={handleAdd} />}
          </span>
        }
      >
        {models.length === 0 && <CardRow title="No models yet" />}
        {models.map((model) => (
          <CardRow
            key={model.id}
            leading={<ModelIcon provider={id} modelId={model.id} size={20} fallback="none" />}
            title={<span className="block truncate">{getModelDisplayName(model)}</span>}
            actions={
              <>
                <ModalityIcons modelInfo={catalogLoaded ? modelInfoOf(id, model) : null} variant="compact" />
                <ModelRowMenu
                  capabilities={capabilitiesOf(id, model)}
                  onFlagChange={(flag, value) => handleFlag(model.id, flag, value)}
                  onRename={() => setRenaming(model)}
                  onRemove={() => void handleRemove(model)}
                />
              </>
            }
          />
        ))}
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
