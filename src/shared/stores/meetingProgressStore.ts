/** Live speech-to-text progress per meeting (part x of y); the meeting's status itself lives in the store. */

import { create } from 'zustand';
import { deriveMeetingPhase, type MeetingJobPart, type MeetingPhase, type MeetingStatus } from '@shared/types/meetingPhase';

interface MeetingProgressState {
  parts: Record<string, MeetingJobPart>;
  setPart: (meetingId: string, part: MeetingJobPart) => void;
  clearPart: (meetingId: string) => void;
}

export const useMeetingProgressStore = create<MeetingProgressState>((set) => ({
  parts: {},
  setPart: (meetingId, part) => set((s) => ({ parts: { ...s.parts, [meetingId]: part } })),
  clearPart: (meetingId) =>
    set((s) => {
      if (!(meetingId in s.parts)) return s;
      const { [meetingId]: _removed, ...rest } = s.parts;
      return { parts: rest };
    }),
}));

/** Writers outside render (the pipeline runner). */
export const meetingProgress = {
  set: (meetingId: string, part: MeetingJobPart) => useMeetingProgressStore.getState().setPart(meetingId, part),
  clear: (meetingId: string) => useMeetingProgressStore.getState().clearPart(meetingId),
};

/** Every meeting's live part — for lists that derive one phase per row. */
export const useMeetingParts = () => useMeetingProgressStore((s) => s.parts);

/** The phase of one meeting: its stored status plus live progress. */
export function useMeetingPhase(meeting: { id: string; status?: MeetingStatus } | null | undefined): MeetingPhase {
  const part = useMeetingProgressStore((s) => (meeting ? s.parts[meeting.id] : undefined));
  return deriveMeetingPhase(meeting?.status, part ?? null);
}
