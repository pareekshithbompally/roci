/** The in-call transcript as the screen shows it: its meeting, its labelled entries, whether it has a gap (and why), and a
 *  streaming model's words still being revised. After Stop the entries stay (`live` false) as the meeting's draft until its
 *  transcript is saved or the next recording starts. */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
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

/** The meeting and its lines are kept for the window's session, so a reload mid-recording shows the draft it had. */
export const useMeetingLiveStore = create<MeetingLiveState>()(persist(
  () => ({ meetingId: null, entries: [], live: false, failed: false, reason: '', partial: {} }),
  { name: LIVE.storageKey, storage: createJSONStorage(() => sessionStorage), partialize: ({ meetingId, entries }) => ({ meetingId, entries }) },
));

export const meetingLiveActions = {
  /** A new recording starts empty; the same one again (the window reloaded mid-recording) keeps the lines it had. */
  start: (meetingId: string) => useMeetingLiveStore.setState((s) => ({
    meetingId, entries: s.meetingId === meetingId ? s.entries : [], live: true, failed: false, reason: '', partial: {},
  })),
  set: (entries: LiveEntry[]) => useMeetingLiveStore.setState({ entries }),
  /** The first reason given stays: it is the one to fix. */
  fail: (reason?: string) => useMeetingLiveStore.setState((s) => ({ failed: true, reason: s.reason || reason || '' })),
  partial: (source: MeetingSource, text: string) => useMeetingLiveStore.setState((s) => ({ partial: { ...s.partial, [source]: text } })),
  /** The recording ended: its entries stay as the draft transcript. */
  end: () => useMeetingLiveStore.setState({ live: false, partial: {} }),
};

const NO_ENTRIES: LiveEntry[] = [];

/** The draft entries of `meetingId`, outside React; empty for any other meeting. */
export function draftEntriesOf(meetingId: string): LiveEntry[] {
  const { meetingId: owner, entries } = useMeetingLiveStore.getState();
  return owner === meetingId ? entries : NO_ENTRIES;
}

/** The draft entries of a meeting just recorded (or recording); empty for any other meeting. */
export function useDraftEntries(meetingId: string | null): LiveEntry[] {
  const owner = useMeetingLiveStore((s) => s.meetingId);
  const entries = useMeetingLiveStore((s) => s.entries);
  return meetingId !== null && owner === meetingId ? entries : NO_ENTRIES;
}
