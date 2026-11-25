/** The in-call transcript as the screen shows it: its meeting, its labelled entries, whether it has a gap (and why), and a
 *  streaming model's words still being revised. After Stop the entries stay (`live` false) as the meeting's draft until its
 *  transcript is saved or the next recording starts. */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import type { LiveEntry } from './liveTranscript';
import { liveIndex } from './liveIndex';
import { latestOf, transcriptText } from './liveText';
import type { MeetingSource } from '@shared/types/native';

interface MeetingLiveState {
  meetingId: string | null;
  entries: LiveEntry[];
  /** The recording is still running. */
  live: boolean;
  /** Why the live transcript stopped, when there is something to fix (a speech model to choose, a key to add); empty while it
   *  carries on (a chunk it only fell behind on or missed leaves the draft with a gap, which Stop makes up from the recording). */
  reason: string;
  /** A streaming model's words still being revised, per source; shown faint until they settle into a line. */
  partial: Partial<Record<MeetingSource, string>>;
}

/** The meeting and its lines are kept for the window's session, so a reload mid-recording shows the draft it had. */
export const useMeetingLiveStore = create<MeetingLiveState>()(persist(
  () => ({ meetingId: null, entries: [], live: false, reason: '', partial: {} }),
  { name: LIVE.storageKey, storage: createJSONStorage(() => sessionStorage), partialize: ({ meetingId, entries }) => ({ meetingId, entries }) },
));

export const meetingLiveActions = {
  /** A new recording starts empty; the same one again (the window reloaded mid-recording) keeps the lines it had. */
  start: (meetingId: string) => {
    useMeetingLiveStore.setState((s) => ({ meetingId, entries: s.meetingId === meetingId ? s.entries : [], live: true, reason: '', partial: {} }));
    liveIndex.start(meetingId, useMeetingLiveStore.getState().entries);
  },
  /** New lines: shown, and the running meeting's search index follows them. */
  set: (entries: LiveEntry[]) => {
    useMeetingLiveStore.setState({ entries });
    const { meetingId, live } = useMeetingLiveStore.getState();
    if (live && meetingId) liveIndex.follow(meetingId, entries);
  },
  /** The first reason given stays: it is the one to fix. */
  fail: (reason: string) => useMeetingLiveStore.setState((s) => ({ reason: s.reason || reason })),
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

/** The transcript so far of the meeting being recorded now, as a model reads it (`chars`: only its newest part); null for any
 *  other meeting. */
export function runningTranscript(meetingId: string, chars?: number): string | null {
  const { meetingId: owner, entries, live } = useMeetingLiveStore.getState();
  if (!live || owner !== meetingId) return null;
  const text = transcriptText(entries);
  return chars === undefined ? text : latestOf(text, chars);
}

/** The draft entries of a meeting just recorded (or recording); empty for any other meeting. */
export function useDraftEntries(meetingId: string | null): LiveEntry[] {
  const owner = useMeetingLiveStore((s) => s.meetingId);
  const entries = useMeetingLiveStore((s) => s.entries);
  return meetingId !== null && owner === meetingId ? entries : NO_ENTRIES;
}
