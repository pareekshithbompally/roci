/** "Your Servers": model servers the user runs (Ollama, LM Studio, llama-server), here or on another computer: the section
 *  on the Providers list, and the Add Server form its page shows. */

import React, { useState } from 'react';
import { useToast } from '@shared/contexts/ToastContext';
import { ADD_SERVER, LOCAL_EMPTY_HINT, LOCAL_RESCAN, LOCAL_SERVERS_FOOTER, LOCAL_SERVERS_GROUP, LOCAL_URL_DRAFT } from '@config/localServers.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle, serverAppOf } from '@shared/utils/provider.utils';
import { platform } from '@platform/index';
import { ProviderStatus, type ProviderRowState } from './ProviderStatus';
import { serverHost } from '@services/providers/localServers';
import type { LocalRow } from '@services/providers/localServers';
import { Button, CardRow, ICON_TILE_PX, Section } from '@shared/ui';
import { FieldRow } from '@shared/components';


function rowState(row: LocalRow): ProviderRowState {
  if (!row.saved?.active) return 'off';
  return row.running ? 'ready' : 'attention';
}

function modelCount(row: LocalRow): string {
  if (!row.running) return 'Not running';
  return row.models.length === 1 ? '1 model' : `${row.models.length} models`;
}

/** Where the server is, then its models; a server named by its address already shows where it is. */
function rowDetail(row: LocalRow): string {
  return serverAppOf(row.id) ? `${serverHost(row.baseUrl)} · ${modelCount(row)}` : modelCount(row);
}


interface AddServerFormProps {
  /** The server answered and was saved under this id. */
  onAdded: (id: string) => void;
}

/** A server's address, then the Add Server action row (Back cancels): Roci asks the server for its models before saving
 *  it (errors in a toast). */
export const AddServerForm: React.FC<AddServerFormProps> = ({ onAdded }) => {
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
      showToast(ADD_SERVER.failed, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const ready = !isAdding && address.trim() !== '' && address !== LOCAL_URL_DRAFT;
  return (
    <>
      <Section footer={ADD_SERVER.footer}>
        <FieldRow title={ADD_SERVER.address} kind="url" value={address} onChange={setAddress} />
      </Section>
      <Section>
        <CardRow title={isAdding ? ADD_SERVER.adding : ADD_SERVER.add} tone="accent" disabled={!ready} onPress={() => void add()} />
      </Section>
    </>
  );
};

interface ServersSectionProps {
  /** Opens a server's page (the same page a cloud provider's row opens). */
  onOpen: (id: string) => void;
  /** Opens the Add Server page. */
  onAdd: () => void;
}

/** "Your Servers": one row per server (a detected one is saved as it opens), Add Server, and Rescan where servers run here. */
export const ServersSection: React.FC<ServersSectionProps> = ({ onOpen, onAdd }) => {
  const { showToast } = useToast();
  const { rows, isScanning, enable, rescan } = useLocalServers();

  const openRow = (row: LocalRow) => {
    if (!row.saved) enable(row);
    onOpen(row.id);
  };

  const handleRescan = () => {
    rescan().catch((error: unknown) => {
      console.error('[ServersSection] Rescan failed:', error);
      showToast('Could not rescan servers', 'error');
    });
  };

  const rescanAction = platform.runsLocalServers && (
    <Button variant="outline" size="sm" loading={isScanning} onClick={handleRescan}>{LOCAL_RESCAN}</Button>
  );

  return (
    <Section title={LOCAL_SERVERS_GROUP} accessory={rescanAction} footer={rows.length === 0 ? LOCAL_EMPTY_HINT : LOCAL_SERVERS_FOOTER}>
      {rows.map((row) => (
        <CardRow
          key={row.id}
          title={getProviderTitle(row.id)}
          leading={<ProvidersAvatar provider={row.id} size={ICON_TILE_PX} />}
          status={<ProviderStatus state={rowState(row)} label={rowDetail(row)} />}
          onOpen={() => openRow(row)}
        />
      ))}
      <CardRow title={ADD_SERVER.title} tone="accent" onPress={onAdd} />
    </Section>
  );
};
