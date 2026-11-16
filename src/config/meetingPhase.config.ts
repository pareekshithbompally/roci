/** Words, colour and icon for each meeting status; read only by `MeetingStatus`. */

import { AlertCircle, AudioWaveform, Loader2, Mic, type LucideIcon } from 'lucide-react';
import type { MeetingPhase, MeetingPipelineStage } from '@shared/types/meetingPhase';

type Kind = MeetingPhase['kind'];
type BadgeTone = 'default' | 'warning' | 'error' | 'info';
type IconTone = 'muted' | 'warning' | 'danger' | 'ai';

export interface MeetingPhaseStyle {
  icon: LucideIcon;
  iconTone: IconTone;
  spin: boolean;
  badge: BadgeTone;
}

export const MEETING_PHASE_STYLE: Record<Kind, MeetingPhaseStyle> = {
  recording: { icon: Mic, iconTone: 'danger', spin: false, badge: 'error' },
  pending: { icon: Mic, iconTone: 'warning', spin: false, badge: 'warning' },
  transcribing: { icon: Loader2, iconTone: 'ai', spin: true, badge: 'info' },
  transcribed: { icon: AlertCircle, iconTone: 'warning', spin: false, badge: 'warning' },
  summarizing: { icon: Loader2, iconTone: 'ai', spin: true, badge: 'info' },
  failed: { icon: AlertCircle, iconTone: 'danger', spin: false, badge: 'error' },
  ready: { icon: AudioWaveform, iconTone: 'muted', spin: false, badge: 'default' },
};

const FAILED_LABEL: Record<MeetingPipelineStage, string> = {
  record: "Couldn't record",
  transcribe: "Couldn't transcribe",
  summarize: "Couldn't summarize",
};

/** Short status label ("Transcribing 2/5", "Couldn't summarize"). */
export function meetingPhaseLabel(phase: MeetingPhase): string {
  switch (phase.kind) {
    case 'recording':
      return 'Recording';
    case 'pending':
      return 'Not transcribed';
    case 'transcribed':
      return 'Not summarized';
    case 'transcribing':
      return phase.part ? `Transcribing ${phase.part.current}/${phase.part.total}` : 'Transcribing';
    case 'summarizing':
      return 'Summarizing';
    case 'failed':
      return FAILED_LABEL[phase.failedAt];
    case 'ready':
      return 'Ready';
  }
}

/** The action a meeting offers in its phase (Cancel while it runs); null when there is none. */
export function meetingPhaseAction(phase: MeetingPhase): string | null {
  switch (phase.kind) {
    case 'transcribing':
    case 'summarizing':
      return 'Cancel';
    case 'pending':
      return 'Transcribe';
    case 'transcribed':
      return 'Summarize';
    case 'failed':
      return phase.failedAt === 'record' ? null : 'Retry';
    case 'ready':
      return 'Re-transcribe';
    default:
      return null;
  }
}

/** Whether the phase's action can run with the AI ready now: transcribing needs a speech engine, summarizing a text model. */
export function meetingPhaseActionReady(phase: MeetingPhase, ready: { text: boolean; speech: boolean }): boolean {
  switch (phase.kind) {
    case 'pending':
    case 'ready':
      return ready.speech;
    case 'transcribed':
      return ready.text;
    case 'failed':
      return phase.failedAt === 'summarize' ? ready.text : ready.speech;
    default:
      return true;
  }
}

/** One sentence under the meeting title explaining the phase; null when there is nothing to say. */
export function meetingPhaseDetail(phase: MeetingPhase): string | null {
  switch (phase.kind) {
    case 'recording':
      return 'Recording now. It is saved here when you stop.';
    case 'pending':
      return "This recording hasn't been transcribed yet.";
    case 'transcribed':
      return 'The transcript is saved. The summary has not been written yet.';
    case 'transcribing':
      return 'Turning the recording into text. The summary follows.';
    case 'summarizing':
      return 'Transcript done. Writing the summary.';
    case 'failed':
      return phase.message;
    case 'ready':
      return null;
  }
}
