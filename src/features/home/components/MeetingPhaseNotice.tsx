/** The notice under a meeting title when it needs you (Transcribe, Summarize, Retry); a meeting at work shows only its badge. */

import React from 'react';
import { Button, Callout } from '@shared/ui';
import { MEETING_PHASE_COPY, meetingPhaseAction, meetingPhaseActionReady, meetingPhaseDetail, meetingPhaseLabel } from '@config/meetingPhase.config';
import { useAIReadiness, useOpenAISetup } from '@features/settings';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import type { CalloutVariant } from '@shared/ui';

const VARIANT: Record<MeetingPhase['kind'], CalloutVariant> = {
  recording: 'neutral',
  paused: 'neutral',
  pending: 'warning',
  transcribing: 'neutral',
  transcribed: 'warning',
  summarizing: 'neutral',
  failed: 'error',
  ready: 'neutral',
};

interface MeetingPhaseNoticeProps {
  phase: MeetingPhase;
  /** Runs the phase action (Transcribe, Retry, Cancel…). */
  onAction?: () => void;
}

export const MeetingPhaseNotice: React.FC<MeetingPhaseNoticeProps> = ({ phase, onAction }) => {
  const aiReady = useAIReadiness();
  const openAISetup = useOpenAISetup();
  const detail = meetingPhaseDetail(phase);
  if (!detail || isMeetingBusy(phase)) return null;

  const action = meetingPhaseAction(phase);
  // Without the AI this action needs, the button goes where it gets set up instead of failing.
  const button = meetingPhaseActionReady(phase, aiReady)
    ? <Button variant="secondary" size="sm" onClick={onAction}>{action}</Button>
    : <Button variant="secondary" size="sm" onClick={openAISetup}>{MEETING_PHASE_COPY.setUpAI}</Button>;
  return (
    <Callout
      variant={VARIANT[phase.kind]}
      action={action && onAction ? button : undefined}
      title={meetingPhaseLabel(phase)}
      detail={detail}
    />
  );
};
