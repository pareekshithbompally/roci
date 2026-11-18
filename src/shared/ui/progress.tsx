import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { META_SEPARATOR } from '@config/ui.config';
import { Text } from './text';
import { cn } from './utils';

const FILL = { neutral: 'bg-inverse', success: 'bg-success', warning: 'bg-warning', error: 'bg-danger' } as const;

const { fill, sweep, appear } = ANIMATION_CONFIG.progress;

export interface ProgressProps {
  /** 0–100, or null for indeterminate */
  percent: number | null;
  tone?: keyof typeof FILL;
  /** `full` spans its container; `compact` is a short inline bar with its percent beside it. */
  size?: 'full' | 'compact';
  /** Compact only: a fact after the percent, e.g. "3s left". */
  detail?: string | null;
  className?: string;
}

/** Thin progress track: determinate fill, or a sweeping segment when indeterminate. */
export function Progress({ percent, tone = 'neutral', size = 'full', detail, className }: ProgressProps) {
  const track = (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cn('relative h-1 rounded-full overflow-hidden bg-layer-3', size === 'full' ? 'w-full' : 'w-16 shrink-0', size === 'full' && className)}
    >
      {percent !== null ? (
        <motion.div
          className={cn('h-full rounded-full', FILL[tone])}
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={fill}
        />
      ) : (
        <motion.div
          className={cn('h-full w-1/4 rounded-full', FILL[tone])}
          animate={{ x: ['0%', '300%', '0%'] }}
          transition={sweep}
        />
      )}
    </div>
  );
  return size === 'full' ? track : <CompactProgress percent={percent} detail={detail} className={className}>{track}</CompactProgress>;
}

/** A compact bar fades in with its percent (and any detail) beside it, in even-width digits so nothing wobbles. */
function CompactProgress({ percent, detail, className, children }: { percent: number | null; detail?: string | null; className?: string; children: ReactNode }) {
  const facts = [percent !== null && `${percent}%`, detail].filter(Boolean).join(META_SEPARATOR);
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className={cn('inline-flex items-center gap-2', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : appear}
    >
      {children}
      {facts && <Text variant="figureSmall" tone="faint">{facts}</Text>}
    </motion.span>
  );
}
