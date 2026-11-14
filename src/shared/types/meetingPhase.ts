/**
 * MeetingPhase — the single answer to "what state is this meeting in?".
 *
 * Derived, never stored: `deriveMeetingPhase` combines the in-flight job
 * (meetingJobsStore) with the persisted flag (HistoryItem.pendingTranscription).
 * Plan: docs/plans/IN-PROGRESS/meeting-state/plan.md
 */

/** Part being sent for engines that split long audio. */
export interface MeetingJobPart {
  current: number;
  total: number;
}

export type MeetingPipelineStage = 'transcribe' | 'summarize';

/** A job running (or just failed) for one meeting. Lives only in meetingJobsStore. */
export type MeetingJob =
  | { stage: 'transcribing'; part: MeetingJobPart | null }
  | { stage: 'summarizing' }
  | { stage: 'failed'; failedAt: MeetingPipelineStage; message: string };

export type MeetingPhase =
  | { kind: 'pending' }
  | { kind: 'transcribing'; part: MeetingJobPart | null }
  | { kind: 'summarizing' }
  | { kind: 'failed'; failedAt: MeetingPipelineStage; message: string }
  | { kind: 'ready' };

// Shared instances keep the reference stable for memoised rows.
const PENDING: MeetingPhase = { kind: 'pending' };
const SUMMARIZING: MeetingPhase = { kind: 'summarizing' };
const READY: MeetingPhase = { kind: 'ready' };

/** Job first (it is newer than disk), then the persisted pending flag, else ready. */
export function deriveMeetingPhase(
  job: MeetingJob | undefined,
  item: { pendingTranscription?: boolean } | null | undefined,
): MeetingPhase {
  if (job?.stage === 'transcribing') return { kind: 'transcribing', part: job.part };
  if (job?.stage === 'summarizing') return SUMMARIZING;
  if (job?.stage === 'failed') return { kind: 'failed', failedAt: job.failedAt, message: job.message };
  return item?.pendingTranscription ? PENDING : READY;
}

/** True while a transcription or summary is running. */
export function isMeetingBusy(phase: MeetingPhase): boolean {
  return phase.kind === 'transcribing' || phase.kind === 'summarizing';
}
