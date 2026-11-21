import React from 'react';
import { cn } from './utils';

/** Canonical status pill: a state dot plus a short label. */
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const DOT: Record<BadgeVariant, string> = {
  default: 'bg-layer-4',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  info: 'bg-info',
};

/** A status that calls out: its colour behind the label (the callout tints). */
const TINT: Record<BadgeVariant, string> = {
  default: 'bg-layer-2 text-muted',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  error: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  /** Filled count pill (no dot) */
  solid?: boolean;
  /** The one status a screen calls out: a tinted pill in the variant's colour. */
  tinted?: boolean;
}

function surfaceOf(variant: BadgeVariant, solid?: boolean, tinted?: boolean): string {
  if (solid) return cn(DOT[variant], 'text-on-accent tabular-nums');
  return tinted ? TINT[variant] : 'text-muted';
}

export function Badge({ variant = 'default', dot = true, solid, tinted, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-subheadline font-medium',
        surfaceOf(variant, solid, tinted),
        className,
      )}
      {...props}
    >
      {dot && !solid && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT[variant])} />}
      {children}
    </span>
  );
}
