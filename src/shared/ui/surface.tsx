import React from 'react';
import { cn } from './utils';
import { Text } from './text';

/**
 * Canonical container surface. Features pick a role, a corner and which edges
 * get a hairline — never a background, border, shadow or radius class.
 *
 *   <Surface variant="sidebar" edge="right">…</Surface>
 *   <Surface variant="card" radius="lg" interactive selected={isActive}>…</Surface>
 */
const VARIANT = {
  /** Window background (vibrancy in dark) */
  page: 'bg-base-glass',
  /** Left sidebar */
  sidebar: 'bg-deep-glass',
  /** Side panels over the page (chat panel) */
  panel: 'bg-base-glass backdrop-blur-xl',
  /** Raised white card */
  card: 'bg-base shadow-raised',
  /** Floating widget over content */
  floating: 'bg-raised-glass backdrop-blur-xl shadow-floating',
  /** Quiet filled area (code, previews, info lists) */
  subtle: 'bg-layer-1',
  /** Recessed group (button groups, chips, user bubble) */
  inset: 'bg-layer-2',
  /** Text-field look for custom inputs (composer shell) */
  field: 'bg-base shadow-input',
  /** Modal backdrop (small-screen sidebar) */
  scrim: 'bg-scrim backdrop-blur-sm',
  /** No fill — edges/radius only */
  plain: '',
} as const;

const RADIUS = { none: '', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' } as const;

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
  /** Hover tint for clickable surfaces */
  interactive?: boolean;
  /** Selected state (list items, chosen cards) */
  selected?: boolean;
  ref?: React.Ref<HTMLElement>;
}

export function Surface({
  as: Tag = 'div',
  variant = 'plain',
  radius = 'none',
  edge,
  interactive,
  selected,
  className,
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
        interactive && 'cursor-pointer transition-colors hover:bg-hover',
        selected && 'bg-pressed',
        className,
      )}
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

/**
 * A status dot and its label (Connected, Waiting for Hex…). The label stays
 * muted unless the state needs attention: warning and danger tint it too.
 */
export function Status({ tone = 'muted', pulse, children }: { tone?: DotTone; pulse?: boolean; children: React.ReactNode }) {
  const textTone = tone === 'warning' || tone === 'danger' ? tone : 'muted';
  return (
    <Text variant="helper" tone={textTone} className="inline-flex items-center gap-1.5">
      <Dot tone={tone} size="xs" pulse={pulse} />
      {children}
    </Text>
  );
}
