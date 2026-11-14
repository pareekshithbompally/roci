/**
 * Meeting phase presentation — the one place a meeting status gets its words,
 * colour and icon. Read only by `MeetingStatus` (@shared/components).
 */

import { AlertCircle, AudioWaveform, Loader2, Mic, type LucideIcon } from 'lucide-react';
import type { MeetingPhase } from '@shared/types/meetingPhase';

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
  pending: { icon: Mic, iconTone: 'warning', spin: false, badge: 'warning' },
  transcribing: { icon: Loader2, iconTone: 'ai', spin: true, badge: 'info' },
  summarizing: { icon: Loader2, iconTone: 'ai', spin: true, badge: 'info' },
  failed: { icon: AlertCircle, iconTone: 'danger', spin: false, badge: 'error' },
  ready: { icon: AudioWaveform, iconTone: 'muted', spin: false, badge: 'default' },
};

/** Short status label ("Transcribing 2/5", "Couldn't summarize"). */
export function meetingPhaseLabel(phase: MeetingPhase): string {
  switch (phase.kind) {
    case 'pending':
      return 'Not transcribed';
    case 'transcribing':
      return phase.part ? `Transcribing ${phase.part.current}/${phase.part.total}` : 'Transcribing';
    case 'summarizing':
      return 'Summarizing';
    case 'failed':
      return phase.failedAt === 'transcribe' ? "Couldn't transcribe" : "Couldn't summarize";
    case 'ready':
      return 'Ready';
  }
}

/** The action a meeting offers in its phase; null while a job runs. */
export function meetingPhaseAction(phase: MeetingPhase): string | null {
  switch (phase.kind) {
    case 'pending':
      return 'Transcribe';
    case 'failed':
      return 'Retry';
    case 'ready':
      return 'Re-transcribe';
    default:
      return null;
  }
}

/** One sentence under the meeting title explaining the phase; null when there is nothing to say. */
export function meetingPhaseDetail(phase: MeetingPhase): string | null {
  switch (phase.kind) {
    case 'pending':
      return "This recording hasn't been transcribed yet.";
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
