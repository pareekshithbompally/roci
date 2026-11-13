import React from 'react';
import { cn } from './utils';
import { TEXT } from '@config/theme.config';

/**
 * Canonical status pill. Replaces ad-hoc green/amber dot+label spans.
 */
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const BADGE_DOT: Record<BadgeVariant, string> = {
  default: 'bg-paper-400 dark:bg-night-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ variant = 'default', dot = true, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full',
        TEXT.secondary,
        className
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', BADGE_DOT[variant])} />}
      {children}
    </span>
  );
}
