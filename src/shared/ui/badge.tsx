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

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  /** Filled count pill (no dot) */
  solid?: boolean;
}

export function Badge({ variant = 'default', dot = true, solid, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-subheadline font-medium',
        solid ? cn(DOT[variant], 'text-on-accent tabular-nums') : 'text-muted',
        className,
      )}
      {...props}
    >
      {dot && !solid && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT[variant])} />}
      {children}
    </span>
  );
}
