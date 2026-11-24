/** "OpenAI-Compatible": servers that speak the OpenAI API, local (Ollama, LM Studio, llama-server) or hosted: the section
 *  on the Providers list, and the Add Server form its page shows. */

import React, { useEffect, useState } from 'react';
import { useToast } from '@shared/contexts/ToastContext';
import { ADD_SERVER, LOCAL_EMPTY_HINT, LOCAL_RESCAN, LOCAL_SERVERS_FOOTER, LOCAL_SERVERS_GROUP, LOCAL_URL_DRAFT } from '@config/localServers.config';
import { useLocalServers } from '@features/settings/hooks/useLocalServers';
import { ProvidersAvatar } from '@shared/components';
import { getProviderTitle, serverAppOf } from '@shared/utils/provider.utils';
import { platform } from '@platform/index';
import { ProviderStatus, type ProviderRowState } from './ProviderStatus';
import { serverHost } from '@services/providers/localServers';
import type { LocalRow } from '@services/providers/localServers';
import { CardRow, ICON_TILE_PX, Input, Section, Spinner } from '@shared/ui';
import { FormDialog } from '@shared/components';
import { PROVIDER_COPY } from '@config/settingsCopy.config';


function rowState(row: LocalRow): ProviderRowState {
  if (!row.saved?.active) return 'off';
  return row.running ? 'ready' : 'attention';
}

function modelCount(row: LocalRow): string {
  if (!row.running) return PROVIDER_COPY.notRunning;
  return row.models.length === 1 ? '1 model' : `${row.models.length} models`;
}

/** Where the server is, under its name (one line); a server named by its address already shows where it is. */
function rowAddress(row: LocalRow): string | undefined {
  return serverAppOf(row.id) ? serverHost(row.baseUrl) : undefined;
}


interface AddServerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The server answered and was saved under this id. */
  onAdded: (id: string) => void;
}

/** Add Server: one form, its address typed in its row and Add in the bar (iPhone, a pushed page) or the footer (a Mac,
 *  a dialog). Roci asks the server for its models before saving it; what went wrong shows on the form. */
export const AddServerForm: React.FC<AddServerFormProps> = ({ open, onOpenChange, onAdded }) => {
  const { addUrl } = useLocalServers();
  const [address, setAddress] = useState(LOCAL_URL_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAddress(LOCAL_URL_DRAFT);
    setError(null);
  }, [open]);

  const add = async () => {
    setIsAdding(true);
    setError(null);
    try {
      const result = await addUrl(address);
      if ('error' in result) setError(result.error);
      else onAdded(result.id);
    } catch (failure: unknown) {
      console.error('[AddServerForm] Add failed:', failure);
      setError(ADD_SERVER.failed);
    } finally {
      setIsAdding(false);
    }
  };

  const ready = address.trim() !== '' && address !== LOCAL_URL_DRAFT;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !isAdding && onOpenChange(next)}
      title={ADD_SERVER.title}
      error={error}
      dirty={address !== LOCAL_URL_DRAFT}
      submit={{ label: isAdding ? ADD_SERVER.adding : ADD_SERVER.add, onPress: () => void add(), disabled: !ready, busy: isAdding }}
    >
      <Section footer={ADD_SERVER.footer}>
        <CardRow
          title={ADD_SERVER.address}
          actions={
            <Input
              variant="plain"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-label={ADD_SERVER.address}
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) void add(); }}
            />
          }
        />
      </Section>
    </FormDialog>
  );
};

interface ServersSectionProps {
  /** Opens a server's page (the same page a cloud provider's row opens). */
  onOpen: (id: string) => void;
  /** Opens the Add Server page. */
  onAdd: () => void;
}

/** "OpenAI-Compatible": one row per server (a detected one is saved as it opens), then its commands as rows: Add Server, and
 *  Rescan where servers run here. */
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
      showToast(PROVIDER_COPY.rescanFailed, 'error');
    });
  };

  return (
    <Section title={LOCAL_SERVERS_GROUP} footer={rows.length === 0 ? LOCAL_EMPTY_HINT : LOCAL_SERVERS_FOOTER}>
      {rows.map((row) => (
        <CardRow
          key={row.id}
          title={getProviderTitle(row.id)}
          leading={<ProvidersAvatar provider={row.id} size={ICON_TILE_PX} />}
          description={rowAddress(row)}
          status={<ProviderStatus state={rowState(row)} label={modelCount(row)} />}
          onOpen={() => openRow(row)}
        />
      ))}
      <CardRow title={ADD_SERVER.title} tone="accent" onPress={onAdd} />
      {/* The list's commands are its tinted rows (Settings, Mac and iPhone): Rescan beside Add Server, a spinner while it looks. */}
      {platform.runsLocalServers && (
        <CardRow title={LOCAL_RESCAN} tone="accent" onPress={isScanning ? undefined : handleRescan} status={isScanning ? <Spinner /> : undefined} />
      )}
    </Section>
  );
};
