/** One MCP server row (Apple's list pattern): icon, name, a quiet line of transport details and state; trailing, only a ⋯ menu
 *  (Edit, Retry, Always Allow, Allow Advanced Screens, Delete) and the on/off switch. */

import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { MCP_APP_CONFIG, MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { MENU_SYMBOLS, META_SEPARATOR } from '@config/ui.config';
import { CardRow, IconButton, Switch } from '@shared/ui';
import { Menu, ServerIcon } from '@shared/components';
import type { MenuEntry } from '@shared/components';
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
  /** Its tools run without asking: "Always Allow" for this server. */
  alwaysAllowed: boolean;
  /** "Run tools without asking" is on, so every server is allowed and the per-server choice is moot. */
  allowAll: boolean;
  onAlwaysAllowChange: (allowed: boolean) => void;
  /** Turn advanced screens on (after a warning) or off for this server. */
  onScreenCodeChange: (allowed: boolean) => void;
  onToggle: (active: boolean) => void;
  onRetry: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const COPY = MCP_APP_CONFIG.copy;

const STATUS_LABEL: Record<McpServerStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  stopping: 'Stopping…',
  offline: 'Not connected',
  off: 'Off',
};

const transportLabel = (config: McpServerConfig) =>
  MCP_CONFIG.transports.find((t) => t.value === (config.type ?? 'stdio'))?.label ?? 'STDIO';

/** "2 env vars" / "1 header": secrets stay out of the row, only their count shows. */
const countOf = (record: Record<string, string> | undefined, noun: string) => {
  const n = Object.keys(record ?? {}).length;
  return n === 0 ? undefined : `${n} ${noun}${n === 1 ? '' : 's'}`;
};

/** The command a STDIO server runs, or a remote server's transport and masked URL. */
function serverLine(config: McpServerConfig): string[] {
  const isStdio = (config.type ?? 'stdio') === 'stdio';
  const parts = isStdio
    ? [[config.command, ...(config.args ?? [])].join(' '), countOf(config.env, 'env var')]
    : [`${transportLabel(config)} ${maskUrl(config.url ?? '')}`, countOf(config.headers, 'header')];
  return parts.filter((part): part is string => !!part);
}

function menuItems(props: McpServerCardProps, status: McpServerStatus): MenuEntry[] {
  const { config, alwaysAllowed, allowAll, disabled, onAlwaysAllowChange, onScreenCodeChange, onRetry, onEdit, onDelete } = props;
  const advanced = !!config.allowScreenCode;
  return [
    { type: 'item', label: 'Edit…', symbol: MENU_SYMBOLS.edit, onSelect: onEdit, disabled },
    ...(status === 'offline' ? [{ type: 'item' as const, label: 'Retry', symbol: MENU_SYMBOLS.retry, onSelect: onRetry, disabled }] : []),
    { type: 'separator' },
    { type: 'check', label: 'Always Allow', checked: allowAll || alwaysAllowed, onSelect: () => onAlwaysAllowChange(!alwaysAllowed), disabled: disabled || allowAll },
    { type: 'check', label: COPY.advancedScreens, checked: advanced, onSelect: () => onScreenCodeChange(!advanced), disabled },
    { type: 'separator' },
    { type: 'item', label: 'Delete Server…', symbol: MENU_SYMBOLS.delete, onSelect: onDelete, disabled, destructive: true },
  ];
}

export const McpServerCard: React.FC<McpServerCardProps> = (props) => {
  const { name, config, connected, icon, pending, disabled, alwaysAllowed, allowAll, onToggle } = props;
  const status = serverStatus(!!config.active, connected, pending);
  const line = [
    ...serverLine(config),
    STATUS_LABEL[status],
    ...(alwaysAllowed && !allowAll ? ['Always allowed'] : []),
    ...(config.allowScreenCode ? [COPY.advancedScreensOn] : []),
  ].join(META_SEPARATOR);
  return (
    <CardRow
      leading={<ServerIcon name={name} icon={icon} size="tile" />}
      title={name}
      description={<span title={line}>{line}</span>}
      actions={
        <>
          <Menu
            label={`${name} options`}
            trigger={<IconButton icon={MoreHorizontal} label={`${name} options`} size="sm" />}
            items={menuItems(props, status)}
          />
          <Switch checked={!!config.active} onCheckedChange={onToggle} disabled={disabled} aria-label={`Enable ${name}`} />
        </>
      }
    />
  );
};
