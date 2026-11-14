/**
 * MeetingStatus — how every screen shows a meeting's phase.
 * `icon` for list rows, `badge` for headers. Words/colours: meetingPhase.config.
 */

import React from 'react';
import { Badge, Icon } from '@shared/ui';
import { MEETING_PHASE_STYLE, meetingPhaseLabel } from '@config/meetingPhase.config';
import type { MeetingPhase } from '@shared/types/meetingPhase';

interface MeetingStatusProps {
  phase: MeetingPhase;
  display: 'icon' | 'badge';
}

export const MeetingStatus: React.FC<MeetingStatusProps> = ({ phase, display }) => {
  const style = MEETING_PHASE_STYLE[phase.kind];
  const label = meetingPhaseLabel(phase);

  if (display === 'icon') {
    return (
      <span title={label} aria-label={label} className="shrink-0 inline-flex">
        <Icon icon={style.icon} size="xs" tone={style.iconTone} className={style.spin ? 'animate-spin' : undefined} />
      </span>
    );
  }

  if (phase.kind === 'ready') return null;
  return <Badge variant={style.badge}>{label}</Badge>;
};
