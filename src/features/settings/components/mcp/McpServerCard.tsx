/** One MCP server row (Apple's list pattern): icon, name, a quiet line of transport details and state, and the on/off
 *  switch; tapping the row opens the server's page (its settings, Always Allow, Advanced Screens, Delete). */

import React from 'react';
import { MCP_APP_CONFIG, MCP_CONFIG, MCP_COPY } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { META_SEPARATOR } from '@config/ui.config';
import { CardRow, Switch } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { maskUrl, serverStatus } from './mcpServerForm';
import { useNetworkOnline } from '@shared/stores/networkStore';

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
  onToggle: (active: boolean) => void;
  /** Open the server's page. */
  onEdit: () => void;
}

const COPY = MCP_APP_CONFIG.copy;

const transportLabel = (config: McpServerConfig) =>
  MCP_CONFIG.transports.find((t) => t.value === (config.type ?? 'stdio'))?.label ?? '';

/** "2 env vars" / "1 header": secrets stay out of the row, only their count shows. */
const countOf = (record: Record<string, string> | undefined, noun: 'env var' | 'header') => {
  const n = Object.keys(record ?? {}).length;
  return n === 0 ? undefined : MCP_COPY.count(n, noun);
};

/** The command a launched server runs, or a remote server's transport and masked URL. */
function serverLine(config: McpServerConfig): string[] {
  const isStdio = (config.type ?? 'stdio') === 'stdio';
  const parts = isStdio
    ? [[config.command, ...(config.args ?? [])].join(' '), countOf(config.env, 'env var')]
    : [`${transportLabel(config)} ${maskUrl(config.url ?? '')}`, countOf(config.headers, 'header')];
  return parts.filter((part): part is string => !!part);
}

export const McpServerCard: React.FC<McpServerCardProps> = (props) => {
  const { name, config, connected, icon, pending, disabled, alwaysAllowed, allowAll, onToggle, onEdit } = props;
  const online = useNetworkOnline();
  const status = serverStatus({ active: !!config.active, connected, pending, online });
  const line = [
    ...serverLine(config),
    MCP_COPY.status[status],
    ...(alwaysAllowed && !allowAll ? [MCP_COPY.alwaysAllowed] : []),
    ...(config.allowScreenCode ? [COPY.advancedScreensOn] : []),
  ].join(META_SEPARATOR);
  return (
    <CardRow
      leading={<ServerIcon name={name} icon={icon} size="tile" />}
      title={name}
      description={<span title={line}>{line}</span>}
      onPress={disabled ? undefined : onEdit}
      actions={<Switch checked={!!config.active} onCheckedChange={onToggle} disabled={disabled} aria-label={MCP_COPY.enable(name)} />}
    />
  );
};
