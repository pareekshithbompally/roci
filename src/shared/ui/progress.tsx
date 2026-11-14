import { motion } from 'framer-motion';
import { cn } from './utils';

const FILL = { neutral: 'bg-inverse', success: 'bg-success', warning: 'bg-warning', error: 'bg-danger' } as const;

export interface ProgressProps {
  /** 0–100, or null for indeterminate */
  percent: number | null;
  tone?: keyof typeof FILL;
  className?: string;
}

/** Thin progress track: determinate fill, or a sweeping segment when indeterminate. */
export function Progress({ percent, tone = 'neutral', className }: ProgressProps) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cn('relative w-full h-1 rounded-full overflow-hidden bg-layer-3', className)}
    >
      {percent !== null ? (
        <motion.div
          className={cn('h-full rounded-full', FILL[tone])}
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      ) : (
        <motion.div
          className={cn('h-full w-1/4 rounded-full', FILL[tone])}
          animate={{ x: ['0%', '300%', '0%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}
