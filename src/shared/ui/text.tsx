import React from 'react';
import { cn } from './utils';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

/** Canonical text: `variant` picks the macOS text style, `tone` the colour role; features never write either. */
/** `inherit` keeps the surrounding size (inline links inside headings / table cells). */
export type TextVariant = keyof typeof TYPOGRAPHY_CLASSES | 'inherit';

export type TextTone = 'primary' | 'muted' | 'faint' | 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'ai' | 'inverse' | 'onAccent' | 'event' | 'eventMeta' | 'inherit';

export const TONE_CLASSES: Record<TextTone, string> = {
  primary: 'text-primary',
  muted: 'text-muted',
  faint: 'text-faint',
  accent: 'text-accent',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  info: 'text-info',
  ai: 'text-ai',
  inverse: 'text-inverse',
  /** On a solid accent or state fill (the calendar's now pill) */
  onAccent: 'text-on-accent',
  /** A calendar event's title, in its calendar's colour (set by an enclosing `Surface tint`) */
  event: 'text-event',
  /** A calendar event's time and details: the same colour, softer than its title */
  eventMeta: 'text-event-meta',
  inherit: '',
};

/** Inline code inside running text. */
/** Code in running text, as a chip; `line`: code standing on its own (a command, path or link as a row's title or value) in
 *  the mono text role, flush with the text around it, never wrapped (it scrolls sideways when longer than its row). */
export function Code({ className, line, ...props }: React.HTMLAttributes<HTMLElement> & { line?: boolean }) {
  return (
    <code
      className={cn(
        'text-primary',
        line
          ? cn(TYPOGRAPHY_CLASSES.mono, 'block min-w-0 flex-1 overflow-x-auto whitespace-nowrap')
          : 'font-mono text-[0.9em] px-1 py-0.5 rounded bg-layer-2',
        className,
      )}
      {...props}
    />
  );
}

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3' | 'h4' | 'li';
  variant?: TextVariant;
  tone?: TextTone;
  truncate?: boolean;
  /** Up to two lines, then an ellipsis (a title that would otherwise be cut short on a phone). */
  clamp?: 2;
  /** Work in progress: a light band sweeps across the words in place of `tone`; faint, still text under Reduce Motion. */
  shimmer?: boolean;
  htmlFor?: string;
}

const SHIMMER_CLASSES =
  'bg-text-shimmer bg-shimmer bg-clip-text text-transparent animate-text-shimmer motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-faint';

export function Text({ as: Tag = 'span', variant = 'body', tone = 'primary', truncate, clamp, shimmer, className, ...props }: TextProps) {
  return (
    <Tag
      className={cn(
        variant === 'inherit' ? '' : TYPOGRAPHY_CLASSES[variant],
        shimmer ? SHIMMER_CLASSES : TONE_CLASSES[tone],
        truncate && 'truncate',
        clamp === 2 && 'line-clamp-2 break-words',
        className,
      )}
      {...props}
    />
  );
}
