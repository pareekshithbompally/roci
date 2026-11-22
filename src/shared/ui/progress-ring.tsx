/** A circular gauge (a download's progress, the composer's context dial): a faint track and its arc, in the current text
 *  colour; something small (a stop square) can sit in its middle. */

import React from 'react';
import { cn } from './utils';

const SIZE = 20;
const STROKE = 2.5;
const RADIUS = 8;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ProgressRingProps {
  /** 0–100. */
  percent: number;
  /** `muted`: the secondary text colour, beside a muted label; omitted, the current colour. */
  tone?: 'muted';
  children?: React.ReactNode;
}

export function ProgressRing({ percent, tone, children }: ProgressRingProps) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', tone === 'muted' && 'text-muted')}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" aria-hidden>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="currentColor" strokeOpacity={0.2} strokeWidth={STROKE} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          strokeLinecap="round"
          strokeWidth={STROKE}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
