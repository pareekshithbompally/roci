/** Words for each meeting status and the app state it is (states.config draws it); read by `MeetingStatus`. */

import { AudioWaveform } from 'lucide-react';
import type { MeetingPhase, MeetingPipelineStage } from '@shared/types/meetingPhase';
import type { StateKind } from '@config/states.config';
import { MENU_SYMBOLS } from '@config/ui.config';

type Kind = MeetingPhase['kind'];

/** Words the meeting's phase notice shows besides its phase (the AI isn't set up yet). */
export const MEETING_PHASE_COPY = { setUpAI: 'Set up AI' } as const;

/** Meetings transcribing or summarizing at once that get an activity row (a handful at most in practice). */
export const BUSY_MEETINGS_SHOWN = 20;

/** Each meeting phase as the app state it is: waiting on a step (not transcribed or summarized yet) is queued. */
export const MEETING_PHASE_STATE: Record<Kind, StateKind> = {
  recording: 'recording',
  paused: 'paused',
  pending: 'queued',
  transcribing: 'transcribing',
  transcribed: 'queued',
  summarizing: 'summarizing',
  failed: 'failed',
  ready: 'ready',
};

/** A finished meeting's mark in a list: what it is (a meeting), not a state. */
export const MEETING_GLYPH = AudioWaveform;

/** What a failed step reads as, wherever a meeting's failure is named (status, tray, notification). */
export const MEETING_FAILED_LABEL: Record<MeetingPipelineStage, string> = {
  record: "Couldn't record",
  transcribe: "Couldn't transcribe",
  summarize: "Couldn't summarize",
};

/** Short status label ("Transcribing 2/5", "Couldn't summarize"). */
export function meetingPhaseLabel(phase: MeetingPhase): string {
  switch (phase.kind) {
    case 'recording':
      return 'Recording';
    case 'paused':
      return 'Paused';
    case 'pending':
      return 'Not transcribed';
    case 'transcribed':
      return 'Not summarized';
    case 'transcribing':
      return phase.part ? `Transcribing ${phase.part.current}/${phase.part.total}` : 'Transcribing';
    case 'summarizing':
      return 'Summarizing';
    case 'failed':
      return MEETING_FAILED_LABEL[phase.failedAt];
    case 'ready':
      return 'Ready';
  }
}

/** The SF Symbol beside each phase action on a Mac menu. */
export const MEETING_PHASE_ACTION_SYMBOL = {
  Cancel: MENU_SYMBOLS.cancel,
  Transcribe: MENU_SYMBOLS.transcribe,
  Summarize: MENU_SYMBOLS.summarize,
  Retry: MENU_SYMBOLS.retry,
  'Re-transcribe': MENU_SYMBOLS.transcribe,
} as const;

export type MeetingPhaseAction = keyof typeof MEETING_PHASE_ACTION_SYMBOL;

/** The action a meeting offers in its phase (Cancel while it runs); null when there is none. */
export function meetingPhaseAction(phase: MeetingPhase): MeetingPhaseAction | null {
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
    case 'paused':
      return 'Recording is paused. Resume to carry on.';
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
