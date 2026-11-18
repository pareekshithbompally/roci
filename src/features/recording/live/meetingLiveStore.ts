/** The in-call transcript the record screen shows: its meeting, its labelled entries, and whether a chunk is being transcribed. */

import { create } from 'zustand';
import type { LiveEntry } from './liveTranscript';

interface MeetingLiveState {
  meetingId: string | null;
  entries: LiveEntry[];
  /** Chunks waiting for or in transcription. */
  pending: number;
}

export const useMeetingLiveStore = create<MeetingLiveState>(() => ({ meetingId: null, entries: [], pending: 0 }));

export const meetingLiveActions = {
  start: (meetingId: string) => useMeetingLiveStore.setState({ meetingId, entries: [], pending: 0 }),
  set: (entries: LiveEntry[]) => useMeetingLiveStore.setState({ entries }),
  working: (more: boolean) => useMeetingLiveStore.setState((s) => ({ pending: Math.max(0, s.pending + (more ? 1 : -1)) })),
  stop: () => useMeetingLiveStore.setState({ meetingId: null, entries: [], pending: 0 }),
};
