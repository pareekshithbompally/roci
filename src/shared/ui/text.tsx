import React from 'react';
import { cn } from './utils';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

/** Canonical text: `variant` picks the macOS text style, `tone` the colour role; features never write either. */
/** `inherit` keeps the surrounding size (inline links inside headings / table cells). */
export type TextVariant = keyof typeof TYPOGRAPHY_CLASSES | 'inherit';

export type TextTone = 'primary' | 'muted' | 'faint' | 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'ai' | 'inverse' | 'inherit';

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
  inherit: '',
};

/** Inline code inside running text. */
export function Code({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <code className={cn('font-mono text-[0.9em] px-1 py-0.5 rounded bg-layer-2 text-primary', className)} {...props} />;
}

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3' | 'h4' | 'li';
  variant?: TextVariant;
  tone?: TextTone;
  truncate?: boolean;
  /** Work in progress: a light band sweeps across the words in place of `tone`; faint, still text under Reduce Motion. */
  shimmer?: boolean;
  htmlFor?: string;
}

const SHIMMER_CLASSES =
  'bg-text-shimmer bg-shimmer bg-clip-text text-transparent animate-text-shimmer motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-faint';

export function Text({ as: Tag = 'span', variant = 'body', tone = 'primary', truncate, shimmer, className, ...props }: TextProps) {
  return (
    <Tag
      className={cn(
        variant === 'inherit' ? '' : TYPOGRAPHY_CLASSES[variant],
        shimmer ? SHIMMER_CLASSES : TONE_CLASSES[tone],
        truncate && 'truncate',
        className,
      )}
      {...props}
    />
  );
}
