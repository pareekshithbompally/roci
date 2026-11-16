/** Line under a meeting title saying what phase it is in, with that phase's one action (Transcribe / Retry). */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Callout, Icon, Text } from '@shared/ui';
import { meetingPhaseAction, meetingPhaseDetail, meetingPhaseLabel } from '@config/meetingPhase.config';
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
  const detail = meetingPhaseDetail(phase);
  if (!detail) return null;

  const action = phase.kind === 'ready' ? null : meetingPhaseAction(phase);
  return (
    <Callout
      variant={VARIANT[phase.kind]}
      icon={isMeetingBusy(phase) ? <Icon icon={Loader2} size="sm" tone="ai" className="animate-spin" /> : undefined}
      action={action && onAction ? <Button variant="secondary" size="sm" onClick={onAction}>{action}</Button> : undefined}
    >
      <Text as="p" variant="bodyStrong" tone="inherit">{meetingPhaseLabel(phase)}</Text>
      <Text as="p" variant="helper" tone="inherit">{detail}</Text>
    </Callout>
  );
};
