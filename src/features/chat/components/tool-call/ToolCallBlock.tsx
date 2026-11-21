import React from 'react';
import { Badge, Disclosure, Icon, Text } from '@shared/ui';
import type { DisclosureVariant } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { useMcpServerInfo } from '@features/settings/hooks';
import { toolKey, type ToolCallView } from './toolCallView';
import { formatExecutionMs, toolCallTitle } from './toolCallTitle';
import { toolCallIcon } from './toolCallIcons';
import { ToolCallBody } from './ToolCallBody';

/** The MCP server's own icon, looked up from the connected servers. */
function McpToolGlyph({ source }: { source: string }) {
  const { data: serverInfo } = useMcpServerInfo();
  return <ServerIcon name={source} icon={serverInfo?.get(source)?.icon} />;
}

/** The server icon for MCP tools, else the tool's glyph; it never swaps while the call runs. */
function ToolCallGlyph({ part }: { part: ToolCallView }) {
  if (part.source) return <McpToolGlyph source={part.source} />;
  return <Icon icon={toolCallIcon(toolKey(part))} size="xs" tone="faint" className="shrink-0" />;
}

/** Trailing meta: a failure badge on error, the duration once complete. */
function ToolCallMeta({ part }: { part: ToolCallView }) {
  if (part.status === 'error') return <Badge variant="error" className="shrink-0">Failed</Badge>;
  const ms = part.result?.executionMs;
  if (part.status !== 'complete' || ms === undefined) return null;
  return <Text variant="caption" tone="faint" className="shrink-0">{formatExecutionMs(ms)}</Text>;
}

export interface ToolCallBlockProps {
  part: ToolCallView;
  /** `inline` at the top of a reply, flush with its text; `row` (default) when nested in a folded run. */
  variant?: DisclosureVariant;
}

/** One tool call as a folded line that shimmers while it runs; opening it shows the call in place. */
export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ part, variant }) => (
  <Disclosure
    variant={variant}
    summary={
      <>
        <ToolCallGlyph part={part} />
        <Text tone="muted" shimmer={part.status === 'calling'} truncate className="min-w-0 mr-auto">{toolCallTitle(part)}</Text>
        <ToolCallMeta part={part} />
      </>
    }
  >
    <ToolCallBody part={part} />
  </Disclosure>
);
