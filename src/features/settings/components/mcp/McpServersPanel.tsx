/**
 * McpServersPanel — Settings → MCP Servers (Jan's settings/mcp-servers page).
 *
 * Header (Experimental badge, mcp.so link, edit-all-JSON, add), the
 * permissions/runtime section, then one row per configured server. Every change
 * runs through `useMcpReconfigure` (disconnect → save → reconnect), one at a
 * time: while a change is in flight every action waits (Jan's
 * `reconfigurationPending` guard), so two changes never race to save.
 */

import React, { useState } from 'react';
import { Braces, Plus } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpConfig } from '@config/mcp.config';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { Badge, Button, Callout, Icon, IconButton, Section, Text } from '@shared/ui';
import { SettingsPage } from '@features/settings/components/shared';
import {
  useMcpConfig,
  useMcpConnectedServers,
  useMcpReconfigure,
  useMcpServerInfo,
  useMcpUpdateListener,
} from '@features/settings/hooks';
import type { McpReconfigureVars } from '@features/settings/hooks';
import { McpRuntimeCard } from './McpRuntimeCard';
import { McpServerCard } from './McpServerCard';
import { AddEditMcpServerDialog } from './AddEditMcpServerDialog';
import { EditMcpJsonDialog } from './EditMcpJsonDialog';
import { applyJson, deleteServer, toggleServer, updateSettings, upsertServers } from './mcpConfigEdits';
import type { McpServerEntry } from './mcpServerForm';
import { errorMessage } from '@shared/utils/errors';


export const McpServersPanel: React.FC = () => {
  useMcpUpdateListener();
  const { data: config, error: loadError, isLoading } = useMcpConfig();
  const { data: connected = [] } = useMcpConnectedServers();
  const { data: serverInfo } = useMcpServerInfo();
  const reconfigure = useMcpReconfigure();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<{ name: string | null } | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);

  const busy = reconfigure.isPending;
  const pendingNames = new Set(busy ? reconfigure.variables?.affected : []);

  /** Dialog saves rethrow so the dialog stays open with the error. */
  const apply = (build: (current: McpConfig) => McpReconfigureVars) => {
    if (!config) return Promise.reject(new Error('MCP config not loaded'));
    return reconfigure.mutateAsync(build(config));
  };

  /** Inline actions (toggles, settings) report failures as a toast. */
  const applyAndToast = (build: (current: McpConfig) => McpReconfigureVars) => {
    apply(build).catch((error: unknown) => showToast(errorMessage(error), 'error'));
  };

  /** The row's status shows the connection; only a failure needs a toast. */
  const handleToggle = (name: string, active: boolean) => {
    apply((c) => toggleServer(c, name, active)).catch((error: unknown) => showToast(errorMessage(error), 'error'));
  };

  const handleDelete = async (name: string) => {
    const confirmed = await confirm({
      title: `Delete "${name}"?`,
      description: 'The server is disconnected and its configuration removed.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    apply((c) => deleteServer(c, name)).catch((error: unknown) => showToast(errorMessage(error), 'error'));
  };

  if (loadError) {
    return (
      <PanelShell onAdd={() => undefined} onEditAll={() => undefined} actionsDisabled>
        <Callout variant="error">Could not load MCP config: {errorMessage(loadError)}</Callout>
      </PanelShell>
    );
  }
  if (isLoading || !config) return <PanelShell onAdd={() => undefined} onEditAll={() => undefined} actionsDisabled />;

  const serverEntries = Object.entries(config.mcpServers);
  const editingConfig = editing?.name ? config.mcpServers[editing.name] : undefined;

  return (
    <PanelShell onAdd={() => setEditing({ name: null })} onEditAll={() => setJsonOpen(true)} actionsDisabled={busy}>
      <Section title="Permissions & runtime">
        <McpRuntimeCard
          settings={config.mcpSettings}
          disabled={busy}
          onChange={(partial) => applyAndToast((c) => updateSettings(c, partial))}
        />
      </Section>

      <Section title="Servers">
        {serverEntries.length === 0 ? (
          <Text as="p" variant="helper" tone="muted" className="py-3">No MCP servers yet. Add one to give chat new tools.</Text>
        ) : (
          serverEntries.map(([name, server]) => (
            <McpServerCard
              key={name}
              name={name}
              config={server}
              connected={connected.includes(name)}
              icon={serverInfo?.get(name)?.icon}
              pending={pendingNames.has(name)}
              disabled={busy}
              onToggle={(active) => handleToggle(name, active)}
              onRetry={() => handleToggle(name, true)}
              onEdit={() => setEditing({ name })}
              onDelete={() => void handleDelete(name)}
            />
          ))
        )}
      </Section>

      <AddEditMcpServerDialog
        open={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        editingName={editing?.name ?? null}
        initial={editingConfig}
        onSave={(entries: McpServerEntry[]) => apply((c) => upsertServers(c, editing?.name ?? null, entries))}
      />

      <EditMcpJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        title="Edit all MCP servers as JSON"
        value={config}
        onSave={(parsed) => apply((c) => applyJson(c, parsed))}
      />
    </PanelShell>
  );
};

// ── Shell ──

interface PanelShellProps {
  onAdd: () => void;
  onEditAll: () => void;
  actionsDisabled?: boolean;
  children?: React.ReactNode;
}

const openDirectory = () => {
  openExternal(MCP_CONFIG.directoryUrl).catch((error: unknown) => {
    console.error('[McpServersPanel] Failed to open MCP directory:', error);
  });
};

const PanelShell: React.FC<PanelShellProps> = ({ onAdd, onEditAll, actionsDisabled, children }) => (
  <SettingsPage
    title={<>MCP Servers <Badge variant="info">Experimental</Badge></>}
    description={
      <>
        Connect Model Context Protocol servers to give chat new tools. Find more at{' '}
        <Button variant="link" size="inline" onClick={openDirectory}>mcp.so</Button>
      </>
    }
    accessory={
      <>
        <IconButton icon={Braces} label="Edit all servers as JSON" size="sm" onClick={onEditAll} disabled={actionsDisabled} />
        <Button variant="outline" onClick={onAdd} disabled={actionsDisabled}>
          <Icon icon={Plus} size="xs" />
          Add server
        </Button>
      </>
    }
  >
    {children}
  </SettingsPage>
);

export default McpServersPanel;
