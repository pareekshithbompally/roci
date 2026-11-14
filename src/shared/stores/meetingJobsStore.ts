/**
 * meetingJobsStore — in-flight transcription/summary jobs, keyed by meeting id.
 *
 * One copy for the whole app, so the sidebar and the meeting view always agree
 * on what is running. Read it through `useMeetingPhase`; write it from the job
 * runner (`useTranscribeRecording`) through `meetingJobs`.
 */

import { create } from 'zustand';
import { deriveMeetingPhase, type MeetingJob, type MeetingPhase } from '@shared/types/meetingPhase';

interface MeetingJobsState {
  jobs: Record<string, MeetingJob>;
  setJob: (meetingId: string, job: MeetingJob) => void;
  clearJob: (meetingId: string) => void;
}

export const useMeetingJobsStore = create<MeetingJobsState>((set) => ({
  jobs: {},
  setJob: (meetingId, job) => set((s) => ({ jobs: { ...s.jobs, [meetingId]: job } })),
  clearJob: (meetingId) =>
    set((s) => {
      if (!(meetingId in s.jobs)) return s;
      const { [meetingId]: _removed, ...rest } = s.jobs;
      return { jobs: rest };
    }),
}));

/** Writers outside render (job runner callbacks). */
export const meetingJobs = {
  set: (meetingId: string, job: MeetingJob) => useMeetingJobsStore.getState().setJob(meetingId, job),
  clear: (meetingId: string) => useMeetingJobsStore.getState().clearJob(meetingId),
};

/** All jobs — for lists that derive one phase per row. Stable ref until a job changes. */
export const useMeetingJobs = () => useMeetingJobsStore((s) => s.jobs);

/** The phase of one meeting. */
export function useMeetingPhase(
  meetingId: string | null | undefined,
  item: { pendingTranscription?: boolean } | null | undefined,
): MeetingPhase {
  const job = useMeetingJobsStore((s) => (meetingId ? s.jobs[meetingId] : undefined));
  return deriveMeetingPhase(job, item);
}
