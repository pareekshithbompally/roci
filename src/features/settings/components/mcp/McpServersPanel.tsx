/** MCP servers settings; changes run one at a time through `useMcpReconfigure` so two saves never race. */

import React, { useState } from 'react';
import { MCP_COPY, type McpConfig, type McpSettings } from '@config/mcp.config';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { Callout, CardRow, Section, Text } from '@shared/ui';
import { SettingsPage } from '@features/settings/components/shared';
import {
  useMcpConfig,
  useMcpConnectedServers,
  useMcpReconfigure,
  useMcpServerInfo,
  useMcpUpdateListener,
} from '@features/settings/hooks';
import type { McpReconfigureVars } from '@features/settings/hooks';
import { McpLimitsCard, McpPermissionsCard } from './McpSettingsRows';
import { McpServerCard } from './McpServerCard';
import { AddEditMcpServerDialog } from './AddEditMcpServerDialog';
import { EditMcpJsonDialog } from './EditMcpJsonDialog';
import { applyJson, deleteServer, setTrust, toggleServer, updateSettings, upsertServers } from './mcpConfigEdits';
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
  const handleToggle = (name: string, active: boolean) => applyAndToast((c) => toggleServer(c, name, active));

  const handleDelete = async (name: string) => {
    const confirmed = await confirm({
      ...MCP_COPY.deleteConfirm(name),
      tone: 'danger',
    });
    if (!confirmed) return;
    setEditing(null);
    apply((c) => deleteServer(c, name)).catch((error: unknown) => showToast(errorMessage(error), 'error'));
  };

  if (loadError) {
    return (
      <PanelShell>
        <Callout variant="error">{MCP_COPY.loadFailed} {errorMessage(loadError)}</Callout>
      </PanelShell>
    );
  }
  if (isLoading || !config) return <PanelShell />;

  const serverEntries = Object.entries(config.mcpServers);
  const changeSettings = (partial: Partial<McpSettings>) => applyAndToast((c) => updateSettings(c, partial));
  const editingName = editing?.name ?? null;
  const editingConfig = editingName ? config.mcpServers[editingName] : undefined;

  return (
    <PanelShell>
      <Section title={MCP_COPY.permissions} footer={MCP_COPY.permissionsFooter}>
        <McpPermissionsCard settings={config.mcpSettings} disabled={busy} onChange={changeSettings} />
      </Section>

      <Section title={MCP_COPY.limits} footer={MCP_COPY.limitsFooter}>
        <McpLimitsCard settings={config.mcpSettings} disabled={busy} onChange={changeSettings} />
      </Section>

      <Section title={MCP_COPY.servers} footer={MCP_COPY.serversFooter}>
        {/* Add Server first, so it stays in view however many servers follow; Edit as JSON closes the list. */}
        <CardRow title={MCP_COPY.addServer} tone="accent" disabled={busy} onPress={() => setEditing({ name: null })} />
        {serverEntries.length === 0 ? (
          <Text as="p" tone="muted" truncate className="py-3">{MCP_COPY.empty}</Text>
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
              onEdit={() => setEditing({ name })}
              alwaysAllowed={config.mcpSettings.trustedServers.includes(name)}
              allowAll={config.mcpSettings.allowAllTools}
            />
          ))
        )}
        <CardRow title={MCP_COPY.editAll} tone="accent" disabled={busy} onPress={() => setJsonOpen(true)} />
      </Section>


      <AddEditMcpServerDialog
        open={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        editingName={editingName}
        initial={editingConfig}
        trusted={editingName !== null && config.mcpSettings.trustedServers.includes(editingName)}
        allowAll={config.mcpSettings.allowAllTools}
        onSave={(entries, trusted) => apply((c) => {
          const vars = upsertServers(c, editingName, entries);
          return trusted === undefined ? vars : setTrust(vars, entries[0][0], trusted);
        })}
        onDelete={editingName ? () => void handleDelete(editingName) : undefined}
      />

      <EditMcpJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        title={MCP_COPY.editAllTitle}
        value={config}
        onSave={(text) => apply((c) => applyJson(c, JSON.parse(text)))}
      />
    </PanelShell>
  );
};

// ── Shell ──

const PanelShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <SettingsPage pane="mcp">{children}</SettingsPage>
);

export default McpServersPanel;
