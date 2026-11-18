// AI at work and AI output landing: the copper moments of a line the model is writing (live enhanced notes).
import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';
import { Text } from './text';

/** A line the model is still writing: the words it starts from, faint, in a copper-tinted row a brighter band sweeps across;
 *  still under Reduce Motion. */
export function AiPending({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('relative flex items-start gap-2 overflow-hidden rounded-lg border border-ai bg-ai-wash px-3 py-2', className)}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-ai-sweep bg-shimmer animate-ai-sweep motion-reduce:hidden" />
      <Icon icon={Sparkles} size="xs" tone="ai" className="relative mt-1 shrink-0 animate-pulse motion-reduce:animate-none" />
      <Text variant="reading" shimmer className="relative min-w-0">{children}</Text>
    </div>
  );
}

/** A line the model just wrote: the copper wash fades out of it. Key it by its text so a rewrite lands again. */
export function AiArrived({ as: Tag = 'div', children, className }: { as?: 'div' | 'li'; children: React.ReactNode; className?: string }) {
  return <Tag className={cn('rounded-md animate-ai-arrive motion-reduce:animate-none', className)}>{children}</Tag>;
}
