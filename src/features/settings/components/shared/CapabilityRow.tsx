/** A job's row (Default Models, onboarding's on-device setup): its tile (hue from its modality), title and picker. Off
 *  (`disabled`) while every job it serves is switched off. */

import React from 'react';
import { CardRow, IconTile, type TileGlyph } from '@shared/ui';

export const CapabilityRow: React.FC<{
  icon: TileGlyph;
  job: { title: string };
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ icon, job, disabled, children }) => (
  <CardRow leading={<IconTile icon={icon} />} title={job.title} actions={children} disabled={disabled} />
);
