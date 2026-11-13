/**
 * McpServerCard — one configured server: live status, transport details
 * (secrets masked), JSON / edit / delete actions, and the enable toggle.
 */

import React from 'react';
import { Braces, Pencil, Trash2 } from 'lucide-react';
import { COMPONENT } from '@config/theme.config';
import { MCP_CONFIG } from '@config/mcp.config';
import type { McpServerConfig } from '@config/mcp.config';
import { Button, Card, CardRow } from '@shared/ui';
import { Toggle } from '@features/settings/components/shared';
import { ServerIcon } from '@shared/components/ServerIcon';
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
  <Card>
    <CardRow
      className="items-start"
      title={
        <span className="flex items-center gap-2">
          <ServerIcon name={name} icon={icon} className="w-4 h-4" />
          {name}
          <span
            className={connected ? COMPONENT.statusDotRunning : COMPONENT.statusDotStopped}
            aria-label={connected ? 'Connected' : 'Not connected'}
          />
        </span>
      }
      description={<ServerDetails config={config} />}
      actions={
        <>
          <Button variant="ghost" size="iconSm" onClick={onEditJson} title={`Edit ${name} as JSON`}>
            <Braces className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onEdit} title="Edit server">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onDelete} title="Delete server">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Toggle checked={!!config.active} onChange={onToggle} disabled={pending} label={`Enable ${name}`} />
        </>
      }
    />
  </Card>
);
