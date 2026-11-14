import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge, Disclosure, Icon, Text } from '@shared/ui';
import { ServerIcon } from '@shared/components';
import { useMcpServerInfo } from '@features/settings/hooks';
import { formatExecutionMs, toolCallTitle, type ToolCallPart } from './toolCallTitle';
import { toolCallIcon } from './toolCallIcons';
import { ToolCallBody } from './ToolCallBody';

/** The MCP server's own icon, looked up from the connected servers. */
function McpToolGlyph({ source }: { source: string }) {
  const { data: serverInfo } = useMcpServerInfo();
  return <ServerIcon name={source} icon={serverInfo?.get(source)?.icon} />;
}

/** Spinner while running, the server icon for MCP tools, else the tool's glyph. */
function ToolCallGlyph({ part }: { part: ToolCallPart }) {
  if (part.status === 'calling') return <Icon icon={Loader2} size="xs" tone="faint" className="shrink-0 animate-spin" />;
  if (part.source) return <McpToolGlyph source={part.source} />;
  return <Icon icon={toolCallIcon(part.toolName)} size="xs" tone="faint" className="shrink-0" />;
}

/** Trailing meta: a failure badge on error, the duration once complete. */
function ToolCallMeta({ part }: { part: ToolCallPart }) {
  if (part.status === 'error') return <Badge variant="error" className="shrink-0">Failed</Badge>;
  const ms = part.result?.executionMs;
  if (part.status !== 'complete' || ms === undefined) return null;
  return <Text variant="caption" tone="faint" className="shrink-0">{formatExecutionMs(ms)}</Text>;
}

export interface ToolCallBlockProps {
  part: ToolCallPart;
}

/**
 * One tool call: collapsible header (glyph, title, status/duration) over its tool-specific body.
 * Open while it runs, folds itself once when it finishes (so a chain of calls stays one line
 * each); the user can open or close it any time after.
 */
export const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ part }) => {
  const running = part.status === 'calling';
  const [open, setOpen] = useState(running);
  useEffect(() => {
    if (!running) setOpen(false);
  }, [running]);

  return (
  <Disclosure
    open={open}
    onOpenChange={setOpen}
    summary={
      <>
        <ToolCallGlyph part={part} />
        <Text tone="muted" truncate className="flex-1 min-w-0">{toolCallTitle(part)}</Text>
        <ToolCallMeta part={part} />
      </>
    }
  >
    <ToolCallBody part={part} />
  </Disclosure>
  );
};
