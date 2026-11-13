/**
 * McpServersPanel — Settings → MCP Servers (Jan's settings/mcp-servers page).
 *
 * Header (Experimental badge, mcp.so link, edit-all-JSON, add), the
 * permissions/runtime card, then one card per configured server. Every change
 * runs through `useMcpReconfigure` (disconnect → save → reconnect).
 */

import React, { useState } from 'react';
import { Braces, Plus } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { LAYOUT, TEXT, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpConfig } from '@config/mcp.config';
import { useToast } from '@shared/contexts/ToastContext';
import { ConfirmDialog } from '@shared/components/ConfirmDialog';
import { Badge, Button, Callout } from '@shared/ui';
import { SettingsSection } from '@features/settings/components/shared';
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

type JsonTarget = { server: string | null } | null;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const McpServersPanel: React.FC = () => {
  useMcpUpdateListener();
  const { data: config, error: loadError, isLoading } = useMcpConfig();
  const { data: connected = [] } = useMcpConnectedServers();
  const { data: serverInfo } = useMcpServerInfo();
  const reconfigure = useMcpReconfigure();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<{ name: string | null } | null>(null);
  const [jsonTarget, setJsonTarget] = useState<JsonTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const pendingNames = reconfigure.isPending ? new Set(reconfigure.variables?.affected) : new Set<string>();

  /** Dialog saves rethrow so the dialog stays open with the error. */
  const apply = (build: (current: McpConfig) => McpReconfigureVars) => {
    if (!config) return Promise.reject(new Error('MCP config not loaded'));
    return reconfigure.mutateAsync(build(config));
  };

  /** Inline actions (toggles, settings) report failures as a toast. */
  const applyAndToast = (build: (current: McpConfig) => McpReconfigureVars) => {
    apply(build).catch((error: unknown) => showToast(errorMessage(error), 'error'));
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
  const jsonValue = jsonTarget?.server ? config.mcpServers[jsonTarget.server] : config;

  return (
    <PanelShell onAdd={() => setEditing({ name: null })} onEditAll={() => setJsonTarget({ server: null })}>
      <SettingsSection title="Permissions & runtime">
        <McpRuntimeCard
          settings={config.mcpSettings}
          disabled={reconfigure.isPending}
          onChange={(partial) => applyAndToast((c) => updateSettings(c, partial))}
        />
      </SettingsSection>

      <SettingsSection title="Servers">
        {serverEntries.length === 0 ? (
          <Callout variant="neutral">No MCP servers yet. Add one to give chat new tools.</Callout>
        ) : (
          <div className="space-y-3">
            {serverEntries.map(([name, server]) => (
              <McpServerCard
                key={name}
                name={name}
                config={server}
                connected={connected.includes(name)}
                icon={serverInfo?.get(name)?.icon}
                pending={pendingNames.has(name)}
                onToggle={(active) => applyAndToast((c) => toggleServer(c, name, active))}
                onEditJson={() => setJsonTarget({ server: name })}
                onEdit={() => setEditing({ name })}
                onDelete={() => setDeleteTarget(name)}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <AddEditMcpServerDialog
        open={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        editingName={editing?.name ?? null}
        initial={editingConfig}
        onSave={(entries: McpServerEntry[]) => apply((c) => upsertServers(c, editing?.name ?? null, entries))}
      />

      <EditMcpJsonDialog
        open={jsonTarget !== null}
        onOpenChange={(isOpen) => !isOpen && setJsonTarget(null)}
        title={jsonTarget?.server ? `Edit ${jsonTarget.server} as JSON` : 'Edit all MCP servers as JSON'}
        value={jsonValue}
        onSave={(parsed) => apply((c) => applyJson(c, parsed, jsonTarget?.server ?? null))}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}
        title="Delete MCP server"
        description={`Remove "${deleteTarget ?? ''}"? It will be disconnected and its configuration deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const name = deleteTarget;
          if (!name) return;
          apply((c) => deleteServer(c, name))
            .then(() => showToast(`Deleted ${name}`, 'success'))
            .catch((error: unknown) => showToast(errorMessage(error), 'error'));
        }}
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
  <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading}`}>MCP Servers</h3>
            <Badge variant="info">Experimental</Badge>
          </div>
          <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
            Connect Model Context Protocol servers to give chat new tools. Find more at{' '}
            <button type="button" onClick={openDirectory} className={COMPONENT.settingsLink}>
              mcp.so
            </button>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="iconSm" onClick={onEditAll} disabled={actionsDisabled} title="Edit all servers as JSON">
            <Braces className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={onAdd} disabled={actionsDisabled}>
            <Plus className="w-3.5 h-3.5" />
            Add server
          </Button>
        </div>
      </div>
      {children}
    </div>
  </div>
);

export default McpServersPanel;
