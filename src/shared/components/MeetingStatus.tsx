/** A meeting's phase: `icon` for list rows (a finished meeting shows what it is, a meeting), `badge` for headers (none when
 *  it is done); the words in meetingPhase.config, the drawing the app's one state kit. */

import React from 'react';
import { Icon, StateBadge, StateMark } from '@shared/ui';
import { MEETING_GLYPH, MEETING_PHASE_STATE, meetingPhaseLabel } from '@config/meetingPhase.config';
import type { MeetingPhase } from '@shared/types/meetingPhase';

interface MeetingStatusProps {
  phase: MeetingPhase;
  display: 'icon' | 'badge';
}

export const MeetingStatus: React.FC<MeetingStatusProps> = ({ phase, display }) => {
  const label = meetingPhaseLabel(phase);
  if (display === 'icon') {
    if (phase.kind === 'ready') return <Icon icon={MEETING_GLYPH} size="xs" tone="muted" label={label} />;
    return <StateMark state={MEETING_PHASE_STATE[phase.kind]} label={label} />;
  }
  if (phase.kind === 'ready') return null;
  return <StateBadge state={MEETING_PHASE_STATE[phase.kind]}>{label}</StateBadge>;
};
