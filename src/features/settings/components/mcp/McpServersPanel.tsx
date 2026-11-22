/** MCP servers settings; changes run one at a time through `useMcpReconfigure` so two saves never race. */

import React, { useState } from 'react';
import { MCP_APP_CONFIG, MCP_COPY, type McpConfig, type McpSettings } from '@config/mcp.config';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { Callout, CardRow, Section, Switch, Text } from '@shared/ui';
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
import { applyJson, deleteServer, toggleServer, updateSettings, upsertServers, withScreenCode, withTrust } from './mcpConfigEdits';
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

  /** Turning advanced screens on warns first; turning them off needs no asking. */
  const handleScreenCode = async (name: string, allowed: boolean) => {
    if (allowed) {
      const { copy } = MCP_APP_CONFIG;
      const agreed = await confirm({
        title: copy.advancedScreensTitle(name),
        description: copy.advancedScreensWarning,
        confirmLabel: copy.advancedScreensAllow,
        tone: 'danger',
      });
      if (!agreed) return;
    }
    applyAndToast((c) => withScreenCode(c, name, allowed));
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
      <Section title={MCP_COPY.permissions} footer={MCP_PERMISSIONS_FOOTER}>
        <McpPermissionsCard settings={config.mcpSettings} disabled={busy} onChange={changeSettings} />
      </Section>

      <Section title={MCP_COPY.limits} footer={MCP_LIMITS_FOOTER}>
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
        editingName={editing?.name ?? null}
        initial={editingConfig}
        onSave={(entries: McpServerEntry[]) => apply((c) => upsertServers(c, editing?.name ?? null, entries))}
        onDelete={editingName ? () => { setEditing(null); void handleDelete(editingName); } : undefined}
      >
        {editingName && editingConfig && (
          <Section title={MCP_COPY.serverOptions}>
            <CardRow
              title={MCP_COPY.alwaysAllow}
              disabled={busy || config.mcpSettings.allowAllTools}
              actions={
                <Switch
                  checked={config.mcpSettings.allowAllTools || config.mcpSettings.trustedServers.includes(editingName)}
                  onCheckedChange={(allowed) => changeSettings({ trustedServers: withTrust(config.mcpSettings.trustedServers, editingName, allowed) })}
                  aria-label={MCP_COPY.alwaysAllow}
                />
              }
            />
            <CardRow
              title={MCP_APP_CONFIG.copy.advancedScreens}
              disabled={busy}
              actions={
                <Switch
                  checked={!!editingConfig.allowScreenCode}
                  onCheckedChange={(allowed) => void handleScreenCode(editingName, allowed)}
                  aria-label={MCP_APP_CONFIG.copy.advancedScreens}
                />
              }
            />
          </Section>
        )}
      </AddEditMcpServerDialog>

      <EditMcpJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        title={MCP_COPY.editAllTitle}
        value={config}
        onSave={(parsed) => apply((c) => applyJson(c, parsed))}
      />
    </PanelShell>
  );
};

// ── Shell ──

const PanelShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <SettingsPage pane="mcp">{children}</SettingsPage>
);

export default McpServersPanel;
