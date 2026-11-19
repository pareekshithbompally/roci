/** The in-call transcript: its meeting, its labelled entries, whether a chunk is being transcribed, and whether a chunk failed.
 *  After Stop the entries stay (`live` false) as the meeting's draft transcript until the next recording starts. */

import { create } from 'zustand';
import type { LiveEntry } from './liveTranscript';

interface MeetingLiveState {
  meetingId: string | null;
  entries: LiveEntry[];
  /** Chunks waiting for or in transcription. */
  pending: number;
  /** The recording is still running. */
  live: boolean;
  /** A chunk couldn't be transcribed: the in-call transcript has a gap, the full one is made after Stop. */
  failed: boolean;
  /** Why, when there is something to fix (a speech model to choose, a key to add); empty when it simply fell behind. */
  reason: string;
}

export const useMeetingLiveStore = create<MeetingLiveState>(() => ({ meetingId: null, entries: [], pending: 0, live: false, failed: false, reason: '' }));

export const meetingLiveActions = {
  start: (meetingId: string) => useMeetingLiveStore.setState({ meetingId, entries: [], pending: 0, live: true, failed: false, reason: '' }),
  set: (entries: LiveEntry[]) => useMeetingLiveStore.setState({ entries }),
  pending: (pending: number) => useMeetingLiveStore.setState({ pending }),
  /** The first reason given stays: it is the one to fix. */
  fail: (reason?: string) => useMeetingLiveStore.setState((s) => ({ failed: true, reason: s.reason || reason || '' })),
  /** The recording ended: its entries stay as the draft transcript. */
  end: () => useMeetingLiveStore.setState({ pending: 0, live: false }),
};

const NO_ENTRIES: LiveEntry[] = [];

/** The draft entries of a meeting just recorded (or recording); empty for any other meeting. */
export function useDraftEntries(meetingId: string | null): LiveEntry[] {
  const owner = useMeetingLiveStore((s) => s.meetingId);
  const entries = useMeetingLiveStore((s) => s.entries);
  return meetingId !== null && owner === meetingId ? entries : NO_ENTRIES;
}
