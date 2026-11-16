/** A meeting's pipeline status (stored with the meeting) and the phase views show (status + live progress). */

/** The step a failed meeting stopped at; Retry reruns only that step. */
export type MeetingPipelineStage = 'record' | 'transcribe' | 'summarize';

export type MeetingStatusName =
  | 'recording'
  | 'captured'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'ready'
  | 'failed';

/** Stored on the meeting; `failedStep` and `error` only when `status` is `failed`. */
export interface MeetingStatus {
  status: MeetingStatusName;
  failedStep?: MeetingPipelineStage;
  error?: string;
}

/** Part being sent for engines that split long audio. */
export interface MeetingJobPart {
  current: number;
  total: number;
}

export type MeetingPhase =
  | { kind: 'recording' }
  | { kind: 'pending' }
  | { kind: 'transcribing'; part: MeetingJobPart | null }
  | { kind: 'transcribed' }
  | { kind: 'summarizing' }
  | { kind: 'failed'; failedAt: MeetingPipelineStage; message: string }
  | { kind: 'ready' };

// Shared instances keep the reference stable for memoised rows.
const FIXED: Record<Exclude<MeetingStatusName, 'transcribing' | 'failed'>, MeetingPhase> = {
  recording: { kind: 'recording' },
  captured: { kind: 'pending' },
  transcribed: { kind: 'transcribed' },
  summarizing: { kind: 'summarizing' },
  ready: { kind: 'ready' },
};

/** The phase for a stored status; `part` is the live STT progress while transcribing. */
export function deriveMeetingPhase(status: MeetingStatus | undefined, part: MeetingJobPart | null = null): MeetingPhase {
  if (!status) return FIXED.ready;
  if (status.status === 'transcribing') return { kind: 'transcribing', part };
  if (status.status === 'failed') {
    return { kind: 'failed', failedAt: status.failedStep ?? 'transcribe', message: status.error ?? 'Something went wrong' };
  }
  return FIXED[status.status];
}

/** True while capture, transcription or a summary is running. */
export function isMeetingBusy(phase: MeetingPhase): boolean {
  return phase.kind === 'recording' || phase.kind === 'transcribing' || phase.kind === 'summarizing';
}
