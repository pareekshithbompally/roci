import React from 'react';
import { Layers } from 'lucide-react';
import { Badge, Disclosure, Icon, Text } from '@shared/ui';
import { CHAT_ACTIVITY_COPY } from '@config/chat.config';
import { META_SEPARATOR } from '@config/ui.config';
import type { ToolCallPart } from '@shared/types';
import { ToolCallBlock, formatExecutionMs } from '@features/chat/components/tool-call';
import type { GenerationStats } from '@services/ai/types';
import { useAutoFold } from '@features/chat/hooks/useAutoFold';
import { ReasoningBlock } from './ReasoningBlock';
import type { ActivityPart, IndexedPart } from './groupActivity';

interface ActivityRunProps {
  items: IndexedPart<ActivityPart>[];
  /** The answer has started after this run, so its rows fold (two or more into one combined row). */
  settled: boolean;
  /** The message's newest part while it streams (null once complete): thinking there is still under way. */
  liveIndex: number | null;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation?: GenerationStats | null;
}

const toolParts = (items: IndexedPart<ActivityPart>[]) =>
  items.map((item) => item.part).filter((part): part is ToolCallPart => part.type === 'tool_call');

/** "Thought · Used 3 tools", naming only what the run did. */
function runTitle(items: IndexedPart<ActivityPart>[]): string {
  const thought = items.some((item) => item.part.type === 'reasoning');
  const tools = toolParts(items).length;
  return [thought && CHAT_ACTIVITY_COPY.thought, tools > 0 && CHAT_ACTIVITY_COPY.tools(tools)].filter(Boolean).join(META_SEPARATOR);
}

/** Trailing meta: how many calls failed, else the tools' total time. */
function RunMeta({ items }: { items: IndexedPart<ActivityPart>[] }) {
  const tools = toolParts(items);
  const failed = tools.filter((part) => part.status === 'error').length;
  if (failed > 0) return <Badge variant="error" className="shrink-0">{CHAT_ACTIVITY_COPY.failed(failed)}</Badge>;
  if (tools.length === 0) return null;
  const totalMs = tools.reduce((sum, part) => sum + (part.result?.executionMs ?? 0), 0);
  return <Text variant="caption" tone="faint" className="shrink-0">{formatExecutionMs(totalMs)}</Text>;
}

/**
 * Each thinking block and tool call as its own row; rows follow their work unless the run has settled.
 * At the top of a reply they sit flush with its text (`inline`); nested in a folded run they're indented rows.
 */
function ActivityRows({ items, settled, liveIndex, generation, nested }: ActivityRunProps & { nested: boolean }) {
  const variant = nested ? 'row' : 'inline';
  return (
    <>
      {items.map(({ part, index }) =>
        part.type === 'reasoning' ? (
          <ReasoningBlock key={index} text={part.text} thinking={index === liveIndex} generation={generation} variant={variant} />
        ) : (
          <ToolCallBlock key={part.toolCallId} part={part} follow={!settled} variant={variant} />
        ),
      )}
    </>
  );
}

/** The folded run's one line: "Thought · Used 3 tools", then failures or the tools' total time. */
function RunSummary({ items }: { items: IndexedPart<ActivityPart>[] }) {
  return (
    <>
      <Icon icon={Layers} size="xs" tone="faint" className="shrink-0" />
      <Text tone="muted" truncate className="flex-1 min-w-0">{runTitle(items)}</Text>
      <RunMeta items={items} />
    </>
  );
}

/**
 * One run of the model's work: separate rows while it works; the moment the answer starts, two or more fold
 * into one line. One tree for the run's whole life, so rows keep their state and the fold animates.
 */
export const ActivityRun: React.FC<ActivityRunProps> = (props) => {
  const folds = props.settled && props.items.length > 1;
  const [open, setOpen] = useAutoFold(!folds, 0);
  return (
    <Disclosure variant="inline" open={open} onOpenChange={setOpen} summary={folds ? <RunSummary items={props.items} /> : undefined}>
      <ActivityRows {...props} nested={folds} />
    </Disclosure>
  );
};
