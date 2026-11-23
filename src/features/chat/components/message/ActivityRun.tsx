import React, { useState } from 'react';
import { Layers } from 'lucide-react';
import { Badge, Disclosure, Icon, Text } from '@shared/ui';
import { CHAT_ACTIVITY_COPY, CHAT_REASONING_COPY } from '@config/chat.config';
import { META_SEPARATOR } from '@config/ui.config';
import { ActivityHeader, ToolCallBlock, formatExecutionMs, toolCallTitle, type ToolCallView } from '@features/chat/components/tool-call';
import type { GenerationStats } from '@services/ai/types';
import { ReasoningBlock } from './ReasoningBlock';
import type { ActivityPart, IndexedPart } from './groupActivity';

interface ActivityRunProps {
  items: IndexedPart<ActivityPart>[];
  /** The message's newest part while it streams (null once complete): thinking there is still under way. */
  liveIndex: number | null;
  /** Tokens and speed while the model thinks, when a local server reports them. */
  generation?: GenerationStats | null;
}

const toolParts = (items: IndexedPart<ActivityPart>[]) =>
  items.map((item) => item.part).filter((part): part is ToolCallView => part.type === 'tool_call');

/** "Thought · Used 3 tools", naming only what the run did. */
function runTitle(items: IndexedPart<ActivityPart>[]): string {
  const thought = items.some((item) => item.part.type === 'reasoning');
  const tools = toolParts(items).length;
  return [thought && CHAT_ACTIVITY_COPY.thought, tools > 0 && CHAT_ACTIVITY_COPY.tools(tools)].filter(Boolean).join(META_SEPARATOR);
}

/** The step under way in this run (the message's newest part), if the model is still on it. */
const liveStep = (items: IndexedPart<ActivityPart>[], liveIndex: number | null) =>
  items.find((item) => item.index === liveIndex)?.part;

/** While working, the step under way ("Thinking…", or the tool's own title); once done, what the run did. */
function headerTitle(items: IndexedPart<ActivityPart>[], live: ActivityPart | undefined): string {
  if (!live) return runTitle(items);
  return live.type === 'reasoning' ? CHAT_REASONING_COPY.thinking : toolCallTitle(live);
}

/** Trailing meta: how many calls failed, else the tools' total time. */
function RunMeta({ items }: { items: IndexedPart<ActivityPart>[] }) {
  const tools = toolParts(items);
  const failed = tools.filter((part) => part.status === 'error').length;
  if (failed > 0) return <Badge variant="error" className="shrink-0">{CHAT_ACTIVITY_COPY.failed(failed)}</Badge>;
  const totalMs = tools.reduce((sum, part) => sum + (part.result?.executionMs ?? 0), 0);
  // No time recorded (none of the calls reported one): nothing to show.
  if (totalMs === 0) return null;
  return <Text variant="caption" tone="faint" className="shrink-0">{formatExecutionMs(totalMs)}</Text>;
}

/**
 * Each thinking block and tool call as its own folded row.
 * At the top of a reply they sit flush with its text (`inline`); nested in a folded run they're indented rows.
 */
function ActivityRows({ items, liveIndex, generation, nested }: ActivityRunProps & { nested: boolean }) {
  const variant = nested ? 'row' : 'inline';
  return (
    <>
      {items.map(({ part, index, key }) =>
        part.type === 'reasoning' ? (
          <ReasoningBlock key={key} text={part.text} thinking={index === liveIndex} generation={generation} variant={variant} />
        ) : (
          <ToolCallBlock key={part.toolCallId} part={part} variant={variant} />
        ),
      )}
    </>
  );
}

/** The folded run's one line: the live step (shimmering) while the model works, then "Thought · Used 3 tools" and
 *  failures or the tools' total time. */
function RunSummary({ items, liveIndex }: Pick<ActivityRunProps, 'items' | 'liveIndex'>) {
  const live = liveStep(items, liveIndex);
  return (
    <ActivityHeader
      glyph={<Icon icon={Layers} size="xs" tone="faint" className="shrink-0" />}
      title={headerTitle(items, live)}
      running={!!live}
      meta={<RunMeta items={items} />}
    />
  );
}

/**
 * One run of the model's work under one header: a lone step is its own folded row; from the second step on, the run
 * is one folded line naming the step under way, open on a click. One tree for the run's whole life, so rows keep
 * their state and the fold animates.
 */
export const ActivityRun: React.FC<ActivityRunProps> = (props) => {
  const folds = props.items.length > 1;
  const [reopened, setReopened] = useState(false);
  return (
    <Disclosure variant="inline" open={!folds || reopened} onOpenChange={setReopened} summary={folds ? <RunSummary items={props.items} liveIndex={props.liveIndex} /> : undefined}>
      <ActivityRows {...props} nested={folds} />
    </Disclosure>
  );
};
