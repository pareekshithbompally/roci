/** The meeting screen's notes: the typed lines (UI state) and, once the summary is written, its AI lines beside them. */

import { useMemo } from 'react';
import { create } from 'zustand';
import { reconcileLines, summaryBullets, type Bullet, type NoteLine, type TypedAt } from './liveNotes';

interface LiveNotesState {
  meetingId: string | null;
  lines: NoteLine[];
}

export const useLiveNotesStore = create<LiveNotesState>(() => ({ meetingId: null, lines: [] }));

const get = useLiveNotesStore.getState;
const set = useLiveNotesStore.setState;

export const liveNotes = {
  /** A new meeting's notes; the same meeting again keeps what is there. */
  start(meetingId: string): void {
    if (get().meetingId === meetingId) return;
    set({ meetingId, lines: [] });
  },

  /** The meeting's saved lines, taken only when nothing is held yet (opening a meeting, or a reload mid-recording). */
  seed(lines: NoteLine[]): void {
    if (get().lines.length === 0) set({ lines });
  },

  type(text: string, now: TypedAt): void {
    set({ lines: reconcileLines(get().lines, text, now) });
  },
};

const NO_BULLETS: Bullet[] = [];

/** A meeting's AI lines: once the summary is written, its filled-in notes and key points (saved with the meeting). */
export function useAiBullets(meetingId: string, enhanced: string[] | undefined, points: string[] | undefined): Bullet[] {
  const owner = useLiveNotesStore((s) => s.meetingId);
  const lines = useLiveNotesStore((s) => s.lines);
  return useMemo(() => {
    if (owner !== meetingId || (enhanced?.length ?? 0) + (points?.length ?? 0) === 0) return NO_BULLETS;
    return summaryBullets(lines, enhanced ?? [], points ?? []);
  }, [meetingId, owner, lines, enhanced, points]);
}
