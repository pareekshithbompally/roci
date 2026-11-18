// One line of AI-written notes, in three states that keep the same place so a line turns into its result where it stands:
// written (plain, continuous with the rest), waiting (the user's own words, faint) and writing (the only copper moment: a tinted
// row a brighter band sweeps across, Roci's mark pulsing). A written line lands with a copper wash that fades out.
import React from 'react';
import { cn } from './utils';
import { Icon } from './icon';
import { RociMark } from './roci-mark';
import { Text } from './text';

export type AiLineState = 'written' | 'waiting' | 'writing';

const ROW: Record<AiLineState, string> = {
  written: 'border-transparent animate-ai-arrive motion-reduce:animate-none',
  waiting: 'border-transparent',
  writing: 'relative overflow-hidden border-ai bg-ai-wash',
};

/** Key a written line by its text so a rewrite lands again. */
export function AiLine({ state, children }: { state: AiLineState; children: React.ReactNode }) {
  const writing = state === 'writing';
  return (
    <li role={writing ? 'status' : undefined} className={cn('flex items-start gap-2 rounded-lg border px-3 py-1.5', ROW[state])}>
      {writing && <span aria-hidden className="pointer-events-none absolute inset-0 bg-ai-sweep bg-shimmer animate-ai-sweep motion-reduce:hidden" />}
      {/* The marker column is one reading line tall, so the mark and the dot both sit on the first line's centre. */}
      <Text aria-hidden variant="reading" tone={state === 'waiting' ? 'faint' : 'ai'} className="relative flex h-[1lh] w-4 shrink-0 items-center justify-center">
        {writing ? <Icon icon={RociMark} size="xs" className="animate-pulse motion-reduce:animate-none" /> : '•'}
      </Text>
      <Text variant="reading" tone={state === 'waiting' ? 'faint' : 'primary'} shimmer={writing} className="relative min-w-0">{children}</Text>
    </li>
  );
}
