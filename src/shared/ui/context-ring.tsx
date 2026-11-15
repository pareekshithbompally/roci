/** Context-window gauge for the composer: an arc of used/total with a breakdown popover; nothing when usage is null. */

import React from 'react';
import type { ContextUsage, ContextLevel } from '@shared/hooks/useContextUsage';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { Progress } from './progress';
import { Text, TONE_CLASSES } from './text';
import type { TextTone } from './text';
import { cn } from './utils';

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

const Dial: React.FC<{ percent: number }> = ({ percent }) => {
  const radius = 8;
  const center = 10;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={2.5}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        strokeLinecap="round"
        strokeWidth={2.5}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
};

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
      <Text variant="mono" tone="muted" className="tabular-nums">
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

const Breakdown: React.FC<{ usage: ContextUsage }> = ({ usage }) => {
  const cachedSub =
    usage.currentCache > 0
      ? `${(usage.currentInput - usage.currentCache).toLocaleString()} fresh + ${usage.currentCache.toLocaleString()} cached`
      : undefined;
  return (
    <div className="flex flex-col gap-1.5 px-1 py-1">
      <div className="flex items-baseline justify-between">
        <Text variant="label" tone="primary">
          Context
        </Text>
        <Text variant="mono" tone="muted" className="tabular-nums">
          {usage.used.toLocaleString()} / {usage.total.toLocaleString()}
        </Text>
      </div>
      <Progress percent={usage.percent} tone={LEVEL_PROGRESS_TONE[usage.level]} />
      <div className="mt-1 flex flex-col gap-2">
        <BreakdownRow label="Prompt" value={formatTokens(usage.currentInput)} sub={cachedSub} />
        <BreakdownRow label="Generated" value={formatTokens(usage.currentOutput)} />
        {(usage.cumulativeInput > 0 || usage.cumulativeOutput > 0) && (
          <>
            <BreakdownRow label="Prompt (all turns)" value={formatTokens(usage.cumulativeInput)} />
            <BreakdownRow
              label="Generated (all turns)"
              value={formatTokens(usage.cumulativeOutput)}
            />
          </>
        )}
        {usage.speed != null && (
          <BreakdownRow label="Speed" value={`${usage.speed.toFixed(0)} tok/s`} />
        )}
      </div>
    </div>
  );
};

export interface ContextRingProps {
  /** Null hides the ring (unknown limit or no usage yet). */
  usage: ContextUsage | null;
  className?: string;
}

export function ContextRing({ usage, className }: ContextRingProps) {
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
          <Dial percent={usage.percent} />
        </button>
      </PopoverTrigger>
      <PopoverContent width="md" side="top" align="end" sideOffset={8}>
        <Breakdown usage={usage} />
      </PopoverContent>
    </Popover>
  );
}
