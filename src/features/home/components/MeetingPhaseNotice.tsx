/** Line under a meeting title saying what phase it is in, with that phase's one action (Transcribe / Retry). */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Callout, Icon, Text } from '@shared/ui';
import { meetingPhaseAction, meetingPhaseActionReady, meetingPhaseDetail, meetingPhaseLabel } from '@config/meetingPhase.config';
import { useAIReadiness, useOpenAISetup } from '@features/settings';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import type { CalloutVariant } from '@shared/ui';

const VARIANT: Record<MeetingPhase['kind'], CalloutVariant> = {
  recording: 'neutral',
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
  if (!detail) return null;

  const action = phase.kind === 'ready' ? null : meetingPhaseAction(phase);
  // Without the AI this action needs, the button goes where it gets set up instead of failing.
  const button = meetingPhaseActionReady(phase, aiReady)
    ? <Button variant="secondary" size="sm" onClick={onAction}>{action}</Button>
    : <Button variant="secondary" size="sm" onClick={openAISetup}>Set up AI</Button>;
  return (
    <Callout
      variant={VARIANT[phase.kind]}
      icon={isMeetingBusy(phase) ? <Icon icon={Loader2} size="sm" tone="ai" className="animate-spin" /> : undefined}
      action={action && onAction ? button : undefined}
    >
      <Text as="p" variant="bodyStrong" tone="inherit">{meetingPhaseLabel(phase)}</Text>
      <Text as="p" variant="helper" tone="inherit">{detail}</Text>
    </Callout>
  );
};
