/**
 * McpServerCard — one configured server row: live status, transport details
 * (secrets masked), JSON / edit / delete actions, and the enable switch.
 */

import React from 'react';
import { Braces, Pencil, Trash2 } from 'lucide-react';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { CardRow, Dot, IconButton, Switch } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { maskKeys, maskUrl } from './mcpServerForm';

interface McpServerCardProps {
  name: string;
  config: McpServerConfig;
  connected: boolean;
  /** The server's own icon (MCP `serverInfo.icons`), once connected. */
  icon?: string | null;
  pending: boolean;
  onToggle: (active: boolean) => void;
  onEditJson: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const transportLabel = (config: McpServerConfig) =>
  MCP_CONFIG.transports.find((t) => t.value === (config.type ?? 'stdio'))?.label ?? 'STDIO';

const Detail: React.FC<{ label: string; value?: string | number }> = ({ label, value }) =>
  value === undefined || value === '' ? null : (
    <span className="block break-all">{label}: {value}</span>
  );

const ServerDetails: React.FC<{ config: McpServerConfig }> = ({ config }) => {
  const isStdio = (config.type ?? 'stdio') === 'stdio';
  return (
    <>
      <Detail label="Transport" value={transportLabel(config)} />
      {isStdio ? (
        <>
          <Detail label="Command" value={config.command} />
          <Detail label="Args" value={config.args?.join(' ')} />
          <Detail label="Env" value={maskKeys(config.env)} />
        </>
      ) : (
        <>
          <Detail label="URL" value={maskUrl(config.url ?? '')} />
          <Detail label="Headers" value={maskKeys(config.headers)} />
          <Detail label="Timeout" value={config.timeout ? `${config.timeout}s` : undefined} />
        </>
      )}
    </>
  );
};

export const McpServerCard: React.FC<McpServerCardProps> = ({
  name,
  config,
  connected,
  icon,
  pending,
  onToggle,
  onEditJson,
  onEdit,
  onDelete,
}) => (
  <CardRow
    className="items-start"
    title={
      <span className="flex items-center gap-2">
        <ServerIcon name={name} icon={icon} size="sm" />
        {name}
        <span className="inline-flex" aria-label={connected ? 'Connected' : 'Not connected'}>
          <Dot tone={connected ? 'success' : 'muted'} size="xs" />
        </span>
      </span>
    }
    description={<ServerDetails config={config} />}
    actions={
      <>
        <IconButton icon={Braces} label={`Edit ${name} as JSON`} size="sm" onClick={onEditJson} />
        <IconButton icon={Pencil} label="Edit server" size="sm" onClick={onEdit} />
        <IconButton icon={Trash2} label="Delete server" size="sm" variant="dangerGhost" onClick={onDelete} />
        <Switch size="sm" checked={!!config.active} onCheckedChange={onToggle} disabled={pending} aria-label={`Enable ${name}`} />
      </>
    }
  />
);
