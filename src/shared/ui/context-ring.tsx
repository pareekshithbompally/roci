/** Context-window gauge for the composer: an arc of used/total with a breakdown popover (the switched-on tools' share, and
 *  the chat's cost so far); nothing when usage is null. */

import React from 'react';
import type { ContextUsage, ContextLevel } from '@shared/hooks/useContextUsage';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Progress } from './progress';
import { ProgressRing } from './progress-ring';
import { Text, TONE_CLASSES } from './text';
import type { TextTone } from './text';
import { cn } from './utils';
import { KIT_COPY } from '@config/kitCopy.config';

const LEVEL_TONE: Record<ContextLevel, TextTone> = {
  ok: 'muted',
  warning: 'warning',
  critical: 'danger',
};

const LEVEL_PROGRESS_TONE = {
  ok: 'success',
  warning: 'warning',
  critical: 'error',
} as const;

function formatTokens(n: number): string {
  return `${n.toLocaleString()} tok`;
}

const BreakdownRow: React.FC<{ label: string; value: string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <div className="grid gap-1.5">
    <div className="flex items-baseline justify-between">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="figureSmall" tone="muted">
        {value}
      </Text>
    </div>
    {sub && (
      <Text variant="caption" tone="faint">
        {sub}
      </Text>
    )}
  </div>
);

/** The chat's cost so far, already formatted, with a note (e.g. replies that have no price). */
export interface ContextRingCost {
  total: string;
  note?: string;
}

/** What the switched-on tools add to each message, already formatted, with a note (e.g. how many are on). */
export interface ContextRingTools {
  total: string;
  note?: string;
}

/** What fills the window after the last reply, the tools' share, the room left, and what the chat has cost. */
const Breakdown: React.FC<{ usage: ContextUsage; tools?: ContextRingTools; cost?: ContextRingCost }> = ({ usage, tools, cost }) => (
  <div className="flex flex-col gap-1.5 px-1 py-1">
    <div className="flex items-baseline justify-between">
      <Text variant="label" tone="primary">
        Context
      </Text>
      <Text variant="figureSmall" tone="muted">
        {usage.used.toLocaleString()} / {usage.total.toLocaleString()}
      </Text>
    </div>
    <Progress percent={usage.percent} tone={LEVEL_PROGRESS_TONE[usage.level]} />
    <div className="mt-1 flex flex-col gap-2">
      <BreakdownRow
        label={KIT_COPY.context.conversation}
        value={formatTokens(usage.prompt)}
        sub={usage.cached > 0 ? `${usage.cached.toLocaleString()} from cache` : undefined}
      />
      <BreakdownRow label={KIT_COPY.context.lastReply} value={formatTokens(usage.reply)} />
      {tools && <BreakdownRow label="Tools, each message" value={tools.total} sub={tools.note} />}
      <BreakdownRow label={KIT_COPY.context.roomLeft} value={formatTokens(usage.left)} />
      {cost && <BreakdownRow label={KIT_COPY.context.cost} value={cost.total} sub={cost.note} />}
    </div>
  </div>
);

export interface ContextRingProps {
  /** Null hides the ring (unknown limit or no usage yet). */
  usage: ContextUsage | null;
  /** The switched-on tools' share of each message; its row is left out when absent. */
  tools?: ContextRingTools;
  /** The chat's cost so far; its row is left out when absent. */
  cost?: ContextRingCost;
  className?: string;
}

export function ContextRing({ usage, tools, cost, className }: ContextRingProps) {
  if (!usage) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Context usage ${usage.percent}%`}
          title={`Context usage ${usage.percent}%`}
          className={cn(
            'flex h-7 w-7 cursor-default items-center justify-center rounded-md transition-colors hover:bg-pressed',
            TONE_CLASSES[LEVEL_TONE[usage.level]],
            className
          )}
        >
          <ProgressRing percent={usage.percent} />
        </button>
      </PopoverTrigger>
      <PopoverContent width="md" side="top" align="end" sideOffset={8}>
        <Breakdown usage={usage} tools={tools} cost={cost} />
      </PopoverContent>
    </Popover>
  );
}
