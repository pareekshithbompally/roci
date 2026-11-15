/** Back-to-back tool calls as one row showing the current call, then a summary like "Used 3 tools · 1.2s". */

import React from 'react';
import { Layers } from 'lucide-react';
import { Badge, Disclosure, Icon, Text } from '@shared/ui';
import { formatExecutionMs, toolCallTitle, type ToolCallPart } from './toolCallTitle';
import { ToolCallBlock, ToolCallGlyph } from './ToolCallBlock';
import { useAutoFold } from './useAutoFold';

function groupTitle(parts: ToolCallPart[], running: ToolCallPart | undefined): string {
  return running ? toolCallTitle(running) : `Used ${parts.length} tools`;
}

/** Trailing meta: how many failed, else the total time once all are done. */
function GroupMeta({ parts, running }: { parts: ToolCallPart[]; running: boolean }) {
  const failed = parts.filter((p) => p.status === 'error').length;
  if (failed > 0) return <Badge variant="error" className="shrink-0">{failed} failed</Badge>;
  if (running) return null;
  const totalMs = parts.reduce((sum, p) => sum + (p.result?.executionMs ?? 0), 0);
  return <Text variant="caption" tone="faint" className="shrink-0">{formatExecutionMs(totalMs)}</Text>;
}

export const ToolCallGroup: React.FC<{ parts: ToolCallPart[] }> = ({ parts }) => {
  const running = parts.find((p) => p.status === 'calling');
  const [open, setOpen] = useAutoFold(!!running);

  return (
    <Disclosure
      open={open}
      onOpenChange={setOpen}
      summary={
        <>
          {running ? <ToolCallGlyph part={running} /> : <Icon icon={Layers} size="xs" tone="faint" className="shrink-0" />}
          <Text tone="muted" truncate className="flex-1 min-w-0">{groupTitle(parts, running)}</Text>
          <GroupMeta parts={parts} running={!!running} />
        </>
      }
    >
      {parts.map((part) => <ToolCallBlock key={part.toolCallId} part={part} follow={false} />)}
    </Disclosure>
  );
};
