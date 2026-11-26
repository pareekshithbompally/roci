/** What something is doing, one vocabulary for the whole app: every state a meeting, a document, a download or a recording
 *  can be in, as its tone (the colour family, tokens.css `--state-*`), its mark (an icon, or the live dot) and its motion.
 *  Features name a state and its words; the kit (`StateMark`, `StateBadge`) draws it. A new state is one entry here. */

import {
  ArrowDownToLine, AudioLines, CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, LoaderCircle, Pause, ScanText, Sparkles,
  type LucideIcon,
} from 'lucide-react';

/** The colour families: happening now, working, waiting on something, done, failed, nothing doing. */
export type StateTone = 'live' | 'working' | 'waiting' | 'done' | 'failed' | 'idle';

/** How a mark moves: a live dot's ring spreads, work breathes, a spinner turns, the rest hold still. */
export type StateMotion = 'live' | 'breathe' | 'spin' | 'still';

export interface StateStyle {
  tone: StateTone;
  /** The icon, or `dot` for something live (a recording, a playback). */
  mark: LucideIcon | 'dot';
  motion: StateMotion;
}

export const STATES = {
  recording: { tone: 'live', mark: 'dot', motion: 'live' },
  playing: { tone: 'done', mark: 'dot', motion: 'live' },
  paused: { tone: 'waiting', mark: Pause, motion: 'still' },
  queued: { tone: 'waiting', mark: Clock, motion: 'still' },
  preparing: { tone: 'working', mark: LoaderCircle, motion: 'spin' },
  transcribing: { tone: 'working', mark: AudioLines, motion: 'breathe' },
  summarizing: { tone: 'working', mark: Sparkles, motion: 'breathe' },
  indexing: { tone: 'working', mark: ScanText, motion: 'breathe' },
  downloading: { tone: 'working', mark: ArrowDownToLine, motion: 'breathe' },
  saving: { tone: 'working', mark: LoaderCircle, motion: 'spin' },
  ready: { tone: 'done', mark: CircleCheck, motion: 'still' },
  /** On but needing you (a key to add, a setting to turn on). */
  attention: { tone: 'waiting', mark: CircleAlert, motion: 'still' },
  failed: { tone: 'failed', mark: CircleAlert, motion: 'still' },
  cancelled: { tone: 'idle', mark: CircleX, motion: 'still' },
  idle: { tone: 'idle', mark: CircleDashed, motion: 'still' },
} as const satisfies Record<string, StateStyle>;

export type StateKind = keyof typeof STATES;
