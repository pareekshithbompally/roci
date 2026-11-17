/** One MCP server row: its icon, one line of masked transport details, live status (Retry when offline), edit/delete, enable switch. */

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { META_SEPARATOR } from '@config/ui.config';
import { Button, CardRow, IconButton, Status, Switch } from '@shared/ui';
import type { DotTone } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { maskUrl, serverStatus, type McpServerStatus } from './mcpServerForm';

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

/** "2 env vars" / "1 header": secrets stay out of the row, only their count shows. */
const countOf = (record: Record<string, string> | undefined, noun: string) => {
  const n = Object.keys(record ?? {}).length;
  return n === 0 ? undefined : `${n} ${noun}${n === 1 ? '' : 's'}`;
};

/** One line: the command a STDIO server runs, or a remote server's transport and masked URL. */
function serverLine(config: McpServerConfig): string {
  const isStdio = (config.type ?? 'stdio') === 'stdio';
  const parts = isStdio
    ? [[config.command, ...(config.args ?? [])].join(' '), countOf(config.env, 'env var')]
    : [`${transportLabel(config)} ${maskUrl(config.url ?? '')}`, countOf(config.headers, 'header')];
  return parts.filter(Boolean).join(META_SEPARATOR);
}

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
      leading={<ServerIcon name={name} icon={icon} size="tile" />}
      title={name}
      description={<span title={serverLine(config)}>{serverLine(config)}</span>}
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
