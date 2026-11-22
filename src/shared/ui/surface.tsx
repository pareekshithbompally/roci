import React from 'react';
import { cn } from './utils';
import { Text } from './text';

/** Canonical container: features pick a role, corner and hairline edges, never background, border, shadow or radius. */
const VARIANT = {
  /** Window background (vibrancy in dark) */
  page: 'bg-base-glass',
  /** Behind grouped cards (Settings screens, sheets of rows): the system grouped background on iOS */
  grouped: 'bg-grouped',
  /** Left sidebar */
  sidebar: 'bg-deep-glass',
  /** Side panels over the page (chat panel) */
  panel: 'bg-base-glass backdrop-blur-xl',
  /** Raised white card */
  card: 'bg-base shadow-raised',
  /** Copper-washed card: a branded choice on a neutral panel (onboarding) */
  brand: 'bg-accent-wash',
  /** Floating widget over content */
  floating: 'bg-raised-glass backdrop-blur-xl shadow-floating',
  /** AI-written result (a meeting's overview): a copper wash fading across, with a soft copper hairline */
  ai: 'bg-ai-card border border-ai-soft',
  /** A copper leading bar marking AI-highlighted content (a summary's decisions) */
  aiBar: 'bg-ai',
  /** Quiet filled area (code, previews, info lists) */

  subtle: 'bg-layer-1',
  /** Recessed group (button groups, chips, user bubble) */
  inset: 'bg-layer-2',
  /** Text-field look for custom inputs (composer shell) */
  field: 'bg-base shadow-input',
  /** Modal backdrop (small-screen sidebar) */
  scrim: 'bg-scrim',
  /** A calendar event block (Upcoming), filled with its calendar's colour (`tint`) as Calendar.app does */
  event: 'bg-event',
  /** An event block's leading bar, in its calendar's colour (`tint`) */
  eventBar: 'bg-event-bar',
  /** The system red mark: the calendar's now line and its time pill */
  nowMark: 'bg-danger',
  /** The now line where it runs on past today, dimmed as in Calendar.app */
  nowTrail: 'bg-danger opacity-30',
  /** No fill — edges/radius only */
  plain: '',
} as const;

/** `field`: half a field's height — a capsule at one line that keeps its corners as it grows (iOS message field). */
const RADIUS = { none: '', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', field: 'rounded-field', full: 'rounded-full' } as const;

const EDGE = {
  top: 'border-t border-muted',
  bottom: 'border-b border-muted',
  left: 'border-l border-muted',
  right: 'border-r border-muted',
  all: 'border border-muted',
} as const;

export type SurfaceVariant = keyof typeof VARIANT;

export interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'aside' | 'header' | 'footer' | 'main' | 'nav' | 'article' | 'li' | 'ul' | 'a';
  /** With as="a" */
  href?: string;
  target?: string;
  rel?: string;
  variant?: SurfaceVariant;
  radius?: keyof typeof RADIUS;
  /** Hairline edge(s) separating this region from its neighbours */
  edge?: keyof typeof EDGE | Array<keyof typeof EDGE>;
  /** Hover tint for clickable surfaces — layered over the variant's fill, never replacing it */
  interactive?: boolean;
  /** Selected state (list items, chosen cards) */
  selected?: boolean;
  /** A runtime colour (`#rrggbb`, e.g. a calendar's) the `event` / `eventBar` variants and `Text tone="event"` inside take; the accent when absent. */
  tint?: string;
  ref?: React.Ref<HTMLElement>;
}

export function Surface({
  as: Tag = 'div',
  variant = 'plain',
  radius = 'none',
  edge,
  interactive,
  selected,
  tint,
  className,
  style,
  ref,
  ...props
}: SurfaceProps) {
  const edges = edge === undefined ? [] : Array.isArray(edge) ? edge : [edge];
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn(
        VARIANT[variant],
        RADIUS[radius],
        edges.map((e) => EDGE[e]).join(' '),
        interactive && 'cursor-pointer',
        selected ? 'bg-tint-pressed' : interactive && 'hover:bg-tint-hover active:bg-tint-pressed',
        className,
      )}
      style={tint ? { ...style, ['--event-tint' as string]: tint } : style}
      {...props}
    />
  );
}

/** Hairline divider between regions or list groups. */
export function Separator({ orientation = 'horizontal', className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-separator', orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch', className)}
    />
  );
}

const DOT_TONE = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  info: 'bg-info',
  accent: 'bg-accent',
  ai: 'bg-ai',
  muted: 'bg-layer-4',
} as const;

export type DotTone = keyof typeof DOT_TONE;

/** Status dot: recording, running/stopped, unread… */
export function Dot({ tone = 'muted', size = 'sm', pulse }: { tone?: DotTone; size?: 'xs' | 'sm'; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 rounded-full', size === 'xs' ? 'w-1.5 h-1.5' : 'w-2 h-2', DOT_TONE[tone], pulse && 'animate-pulse')}
    />
  );
}

/** A status dot and label (Connected, Waiting for Hex…); the label is muted unless warning or danger. */
export function Status({ tone = 'muted', pulse, children }: { tone?: DotTone; pulse?: boolean; children: React.ReactNode }) {
  const textTone = tone === 'warning' || tone === 'danger' ? tone : 'muted';
  return (
    <Text variant="helper" tone={textTone} className="inline-flex items-center gap-1.5">
      <Dot tone={tone} size="xs" pulse={pulse} />
      {children}
    </Text>
  );
}
