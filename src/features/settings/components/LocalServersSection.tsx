/** "Your Servers": model servers the user runs (Ollama, LM Studio, llama-server), here or on another computer. One add
 *  form and one row state for both layouts: the Mac sidebar group, and the phone's card whose rows push their detail. */

import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@shared/contexts/ToastContext';
import { LOCAL_EMPTY_HINT, LOCAL_SERVERS_GROUP, LOCAL_URL_DRAFT } from '@config/localServers.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { platform } from '@platform/index';
import { ProviderGroup, ProviderListItem } from './ProviderListItem';
import type { ProviderRowState } from './ProviderListItem';
import type { LocalRow } from '@services/providers/localServers';
import { Button, CardRow, IconButton, Input, Section, Status, Text, useNavStack } from '@shared/ui';
import type { DotTone } from '@shared/ui';

const ADD_TITLE = 'Add Server';

function rowState(row: LocalRow): ProviderRowState {
  if (!row.saved?.active) return 'off';
  return row.running ? 'ready' : 'attention';
}

function rowDetail(row: LocalRow): string {
  if (!row.running) return 'Not running';
  return row.models.length === 1 ? '1 model' : `${row.models.length} models`;
}

const ROW_TONE: Record<ProviderRowState, DotTone> = { ready: 'success', attention: 'warning', off: 'muted' };

interface AddServerFormProps {
  /** The server answered and was saved under this id. */
  onAdded: (id: string) => void;
  onCancel: () => void;
}

/** A server's address, then Add: Roci asks the server for its models before saving it (errors in a toast). */
const AddServerForm: React.FC<AddServerFormProps> = ({ onAdded, onCancel }) => {
  const { showToast } = useToast();
  const { addUrl } = useLocalServers();
  const [address, setAddress] = useState(LOCAL_URL_DRAFT);
  const [isAdding, setIsAdding] = useState(false);

  const add = async () => {
    setIsAdding(true);
    try {
      const result = await addUrl(address);
      if ('error' in result) showToast(result.error, 'error');
      else onAdded(result.id);
    } catch (error: unknown) {
      console.error('[AddServerForm] Add failed:', error);
      showToast('Could not add that server', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <form
      className="flex flex-wrap justify-end gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <Input
        autoFocus
        type="url"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        aria-label="Server address"
        className="basis-full"
      />
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={isAdding}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" size="sm" disabled={isAdding || !address.trim()}>
        {isAdding ? 'Connecting…' : 'Add'}
      </Button>
    </form>
  );
};

interface LocalServersSectionProps {
  selectedProvider: string | null;
  onSelect: (provider: string) => void;
}

/** Mac and iPad: the sidebar group; Rescan where servers run on this device, Add opens the form in place. */
export const LocalServersSection: React.FC<LocalServersSectionProps> = ({ selectedProvider, onSelect }) => {
  const { showToast } = useToast();
  const { rows, isScanning, enable, rescan } = useLocalServers();
  const [adding, setAdding] = useState(false);

  const handleRescan = () => {
    rescan().catch((error: unknown) => {
      console.error('[LocalServersSection] Rescan failed:', error);
      showToast('Could not rescan servers', 'error');
    });
  };

  const handleSelect = (row: LocalRow) => {
    if (row.saved) onSelect(row.id);
    else enable(row);
  };

  const actions = (
    <>
      {platform.runsLocalServers && (
        <IconButton icon={RefreshCw} label="Rescan servers" size="sm" spin={isScanning} onClick={handleRescan} />
      )}
      <IconButton icon={Plus} label="Add a server by its address" size="sm" onClick={() => setAdding(true)} />
    </>
  );

  return (
    <ProviderGroup title={LOCAL_SERVERS_GROUP} accessory={actions}>
      {rows.map((row) => (
        <ProviderListItem
          key={row.id}
          provider={row.id}
          selected={selectedProvider === row.id}
          state={rowState(row)}
          onSelect={() => handleSelect(row)}
          detail={rowDetail(row)}
        />
      ))}

      {adding && <AddServerForm onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} />}

      {rows.length === 0 && !adding && (
        <Text as="p" variant="helper" tone="faint" className="px-2">{LOCAL_EMPTY_HINT}</Text>
      )}
    </ProviderGroup>
  );
};

interface PhoneServersSectionProps {
  /** Pushes a saved server's detail (the same screen a cloud provider's row opens). */
  onOpen: (id: string) => void;
}

/** iPhone: one card of servers (each row pushes its detail), then Add Server, which pushes the same form. */
export const PhoneServersSection: React.FC<PhoneServersSectionProps> = ({ onOpen }) => {
  const { push, remove } = useNavStack();
  const { rows, enable } = useLocalServers();

  const openRow = (row: LocalRow) => {
    if (!row.saved) enable(row);
    onOpen(row.id);
  };

  // The form closes its own screen by id: a pushed screen's content keeps the callbacks it was pushed with.
  const openAdd = () => {
    const screen = push({
      title: ADD_TITLE,
      content: (
        <div className="p-4">
          <AddServerForm
            onAdded={(id) => {
              remove(screen);
              onOpen(id);
            }}
            onCancel={() => remove(screen)}
          />
        </div>
      ),
    });
  };

  return (
    <Section title={LOCAL_SERVERS_GROUP} footer={rows.length === 0 ? LOCAL_EMPTY_HINT : undefined}>
      {rows.map((row) => (
        <CardRow
          key={row.id}
          title={getProviderTitle(row.id)}
          leading={<ProvidersAvatar provider={row.id} size={20} />}
          status={<Status tone={ROW_TONE[rowState(row)]}>{rowDetail(row)}</Status>}
          onOpen={() => openRow(row)}
        />
      ))}
      <CardRow title={ADD_TITLE} tone="accent" onPress={openAdd} />
    </Section>
  );
};
