/** The in-call transcript as the screen shows it: its meeting, its labelled entries, whether it has a gap (and why), and a
 *  streaming model's words still being revised. After Stop the entries stay (`live` false) as the meeting's draft until its
 *  transcript is saved or the next recording starts. */

import { create } from 'zustand';
import type { LiveEntry } from './liveTranscript';
import type { MeetingSource } from '@shared/types/native';

interface MeetingLiveState {
  meetingId: string | null;
  entries: LiveEntry[];
  /** The recording is still running. */
  live: boolean;
  /** A chunk was lost or couldn't be transcribed: the draft has a gap (the transcript comes from the whole recording anyway). */
  failed: boolean;
  /** Why, when there is something to fix (a speech model to choose, a key to add); empty when it simply fell behind. */
  reason: string;
  /** A streaming model's words still being revised, per source; shown faint until they settle into a line. */
  partial: Partial<Record<MeetingSource, string>>;
}

export const useMeetingLiveStore = create<MeetingLiveState>(() => ({ meetingId: null, entries: [], live: false, failed: false, reason: '', partial: {} }));

export const meetingLiveActions = {
  start: (meetingId: string) => useMeetingLiveStore.setState({ meetingId, entries: [], live: true, failed: false, reason: '', partial: {} }),
  set: (entries: LiveEntry[]) => useMeetingLiveStore.setState({ entries }),
  /** The first reason given stays: it is the one to fix. */
  fail: (reason?: string) => useMeetingLiveStore.setState((s) => ({ failed: true, reason: s.reason || reason || '' })),
  partial: (source: MeetingSource, text: string) => useMeetingLiveStore.setState((s) => ({ partial: { ...s.partial, [source]: text } })),
  /** The recording ended: its entries stay as the draft transcript. */
  end: () => useMeetingLiveStore.setState({ live: false, partial: {} }),
};

const NO_ENTRIES: LiveEntry[] = [];

/** The draft entries of a meeting just recorded (or recording); empty for any other meeting. */
export function useDraftEntries(meetingId: string | null): LiveEntry[] {
  const owner = useMeetingLiveStore((s) => s.meetingId);
  const entries = useMeetingLiveStore((s) => s.entries);
  return meetingId !== null && owner === meetingId ? entries : NO_ENTRIES;
}
