import React from 'react';
import { Text } from '@shared/ui';

interface SpeakerBadgeProps {
  speaker: string;
  /** Stable per-meeting speaker order (first speaker = 0). */
  index: number;
}

/** Speaker name above a transcript line. */
export const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({ speaker }) => (
  <Text variant="label" tone="muted" title={`Speaker: ${speaker}`}>
    {speaker}
  </Text>
);

export default SpeakerBadge;
