/**
 * McpServerCard — one configured server row: labelled live status (with Retry
 * when an enabled server is not connected), transport details (secrets
 * masked), edit / delete actions, and the enable switch.
 */

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { Button, CardRow, IconButton, Status, Switch } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { maskKeys, maskUrl, serverStatus, type McpServerStatus } from './mcpServerForm';

interface McpServerCardProps {
  name: string;
  config: McpServerConfig;
  connected: boolean;
  /** The server's own icon (MCP `serverInfo.icons`), once connected. */
  icon?: string | null;
  /** This server is the one being reconnected right now. */
  pending: boolean;
  /** Some MCP change is in flight; actions wait for it. */
  disabled: boolean;
  onToggle: (active: boolean) => void;
  onRetry: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const STATUS: Record<McpServerStatus, { label: string; tone: DotTone; pulse?: boolean }> = {
  connected: { label: 'Connected', tone: 'success' },
  connecting: { label: 'Connecting…', tone: 'info', pulse: true },
  stopping: { label: 'Stopping…', tone: 'muted', pulse: true },
  offline: { label: 'Not connected', tone: 'danger' },
  off: { label: 'Off', tone: 'muted' },
};

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
  disabled,
  onToggle,
  onRetry,
  onEdit,
  onDelete,
}) => {
  const status = serverStatus(!!config.active, connected, pending);
  const { label, tone, pulse } = STATUS[status];
  return (
    <CardRow
      align="start"
      leading={<ServerIcon name={name} icon={icon} size="sm" />}
      title={name}
      description={<ServerDetails config={config} />}
      status={
        <>
          <Status tone={tone} pulse={pulse}>{label}</Status>
          {status === 'offline' && (
            <Button variant="link" size="inline" onClick={onRetry} disabled={disabled}>Retry</Button>
          )}
        </>
      }
      actions={
        <>
          <IconButton icon={Pencil} label="Edit server" size="sm" onClick={onEdit} disabled={disabled} />
          <IconButton icon={Trash2} label="Delete server" size="sm" variant="dangerGhost" onClick={onDelete} disabled={disabled} />
          <Switch size="sm" checked={!!config.active} onCheckedChange={onToggle} disabled={disabled} aria-label={`Enable ${name}`} />
        </>
      }
    />
  );
};
