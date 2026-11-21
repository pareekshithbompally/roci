/** "Your Servers": model servers the user runs (Ollama, LM Studio, llama-server), here or on another computer: the section
 *  on the Providers list, and the Add Server form its page shows. */

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@shared/contexts/ToastContext';
import { LOCAL_EMPTY_HINT, LOCAL_SERVERS_GROUP, LOCAL_URL_DRAFT } from '@config/localServers.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle, serverAppOf } from '@shared/utils/provider.utils';
import { platform } from '@platform/index';
import type { ProviderRowState } from './ProviderStatus';
import { serverHost } from '@services/providers/localServers';
import type { LocalRow } from '@services/providers/localServers';
import { Button, CardRow, ICON_TILE_PX, IconButton, Input, Section, Status } from '@shared/ui';
import type { DotTone } from '@shared/ui';

export const ADD_SERVER_TITLE = 'Add Server';

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

const ROW_TONE: Record<ProviderRowState, DotTone> = { ready: 'success', attention: 'warning', off: 'muted' };

interface AddServerFormProps {
  /** The server answered and was saved under this id. */
  onAdded: (id: string) => void;
  onCancel: () => void;
}

/** A server's address, then Add: Roci asks the server for its models before saving it (errors in a toast). */
export const AddServerForm: React.FC<AddServerFormProps> = ({ onAdded, onCancel }) => {
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
    <IconButton icon={RefreshCw} label="Rescan servers" size="sm" spin={isScanning} onClick={handleRescan} />
  );

  return (
    <Section title={LOCAL_SERVERS_GROUP} accessory={rescanAction} footer={rows.length === 0 ? LOCAL_EMPTY_HINT : undefined}>
      {rows.map((row) => (
        <CardRow
          key={row.id}
          title={getProviderTitle(row.id)}
          leading={<ProvidersAvatar provider={row.id} size={ICON_TILE_PX} />}
          status={<Status tone={ROW_TONE[rowState(row)]}>{rowDetail(row)}</Status>}
          onOpen={() => openRow(row)}
        />
      ))}
      <CardRow title={ADD_SERVER_TITLE} tone="accent" onPress={onAdd} />
    </Section>
  );
};
