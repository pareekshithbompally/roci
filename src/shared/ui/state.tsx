/** What something is doing, drawn the same everywhere: `StateMark` is its icon (or a live dot) in its tone, moving as its
 *  state does; `StateBadge` is the mark and its words on a soft wash of the tone; `Status` is a row's mark and words. The states, their tones, marks and
 *  motion are `STATES` (config); Reduce Motion holds every mark still. */

import React from 'react';
import { STATES, type StateKind, type StateMotion, type StateTone } from '@config/states.config';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';

const MARK: Record<StateTone, string> = {
  live: 'text-state-live',
  working: 'text-state-working',
  waiting: 'text-state-waiting',
  done: 'text-state-done',
  failed: 'text-state-failed',
  idle: 'text-state-idle',
};

const DOT: Record<StateTone, string> = {
  live: 'bg-state-live',
  working: 'bg-state-working',
  waiting: 'bg-state-waiting',
  done: 'bg-state-done',
  failed: 'bg-state-failed',
  idle: 'bg-state-idle',
};

const BADGE: Record<StateTone, string> = {
  live: 'bg-state-live-wash text-state-live-ink',
  working: 'bg-state-working-wash text-state-working-ink',
  waiting: 'bg-state-waiting-wash text-state-waiting-ink',
  done: 'bg-state-done-wash text-state-done-ink',
  failed: 'bg-state-failed-wash text-state-failed-ink',
  idle: 'bg-state-idle-wash text-state-idle-ink',
};

const INK: Record<StateTone, string> = {
  live: 'text-state-live-ink',
  working: 'text-state-working-ink',
  waiting: 'text-state-waiting-ink',
  done: 'text-state-done-ink',
  failed: 'text-state-failed-ink',
  idle: 'text-state-idle-ink',
};

const MOTION: Record<StateMotion, string | undefined> = {
  live: 'motion-safe:animate-state-live',
  breathe: 'motion-safe:animate-state-breathe',
  spin: 'motion-safe:animate-state-spin',
  still: undefined,
};

export interface StateMarkProps {
  state: StateKind;
  size?: 'xs' | 'sm';
  /** Its words for VoiceOver when it stands alone (a list row's mark); none inside a badge, whose label says it. */
  label?: string;
}

export function StateMark({ state, size = 'xs', label }: StateMarkProps) {
  const { tone, mark, motion } = STATES[state];
  const named = label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true };
  if (mark === 'dot') {
    return (
      <span {...named} className={cn('inline-flex shrink-0 items-center justify-center', size === 'xs' ? 'size-3' : 'size-4', MARK[tone])}>
        <span className={cn('rounded-full', size === 'xs' ? 'size-1.5' : 'size-2', DOT[tone], MOTION[motion])} />
      </span>
    );
  }
  return (
    <span {...named} className={cn('inline-flex shrink-0', MARK[tone], MOTION[motion])}>
      <Icon icon={mark} size={size} tone="inherit" />
    </span>
  );
}

export interface StateBadgeProps {
  state: StateKind;
  /** Its words ("Indexing…", "Transcribing 2/5", "Couldn't read"). */
  children: React.ReactNode;
  className?: string;
}

export function StateBadge({ state, children, className }: StateBadgeProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-subheadline font-medium', BADGE[STATES[state].tone], className)}>
      <StateMark state={state} />
      {children}
    </span>
  );
}

/** A row's state as its mark and a word or two (Connected, Needs key, Waiting for Hex): the words in the state's ink when
 *  it needs you (waiting, failed), muted otherwise. */
export function Status({ state, children }: { state: StateKind; children: React.ReactNode }) {
  const tone = STATES[state].tone;
  const loud = tone === 'waiting' || tone === 'failed';
  return (
    <Text variant="helper" tone={loud ? 'inherit' : 'muted'} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', loud && INK[tone])}>
      <StateMark state={state} />
      {children}
    </Text>
  );
}
