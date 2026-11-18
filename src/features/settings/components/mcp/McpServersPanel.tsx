/** MCP servers settings; changes run one at a time through `useMcpReconfigure` so two saves never race. */

import React, { useState } from 'react';
import { Braces, Plus } from 'lucide-react';
import type { McpConfig, McpSettings } from '@config/mcp.config';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { Button, Callout, Icon, IconButton, Section, Text } from '@shared/ui';
import { SettingsPage } from '@features/settings/components/shared';
import {
  useMcpConfig,
  useMcpConnectedServers,
  useMcpReconfigure,
  useMcpServerInfo,
  useMcpUpdateListener,
} from '@features/settings/hooks';
import type { McpReconfigureVars } from '@features/settings/hooks';
import { MCP_LIMITS_FOOTER, MCP_PERMISSIONS_FOOTER, McpLimitsCard, McpPermissionsCard } from './McpSettingsRows';
import { McpServerCard } from './McpServerCard';
import { AddEditMcpServerDialog } from './AddEditMcpServerDialog';
import { EditMcpJsonDialog } from './EditMcpJsonDialog';
import { applyJson, deleteServer, toggleServer, updateSettings, upsertServers, withTrust } from './mcpConfigEdits';
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
  const changeSettings = (partial: Partial<McpSettings>) => applyAndToast((c) => updateSettings(c, partial));
  const editingConfig = editing?.name ? config.mcpServers[editing.name] : undefined;

  return (
    <PanelShell onAdd={() => setEditing({ name: null })} onEditAll={() => setJsonOpen(true)} actionsDisabled={busy}>
      <Section title="Permissions" footer={MCP_PERMISSIONS_FOOTER}>
        <McpPermissionsCard settings={config.mcpSettings} disabled={busy} onChange={changeSettings} />
      </Section>

      <Section title="Limits" footer={MCP_LIMITS_FOOTER}>
        <McpLimitsCard settings={config.mcpSettings} disabled={busy} onChange={changeSettings} />
      </Section>

      <Section
        title="Servers"
        footer="Model Context Protocol servers give chat new tools."
      >
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
              alwaysAllowed={config.mcpSettings.trustedServers.includes(name)}
              allowAll={config.mcpSettings.allowAllTools}
              onAlwaysAllowChange={(allowed) => changeSettings({ trustedServers: withTrust(config.mcpSettings.trustedServers, name, allowed) })}
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

const PanelShell: React.FC<PanelShellProps> = ({ onAdd, onEditAll, actionsDisabled, children }) => (
  <SettingsPage
    title="MCP Servers"
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
