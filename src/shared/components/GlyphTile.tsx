/** A bare glyph image on a raised white tile: app-icon size on choice cards, list-art size in settings rows. */

import React from 'react';
import { ICON_SIZE_PX, LIST_ART_PX, LIST_ART_RADIUS, Surface } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

const CHOICE = UI_CONFIG.glyphTile;
const ROW = { tile: LIST_ART_PX, glyph: ICON_SIZE_PX.xs };

export const GlyphTile: React.FC<{ src: string; size?: 'choice' | 'row' }> = ({ src, size = 'choice' }) => {
  const { tile, glyph } = size === 'row' ? ROW : CHOICE;
  return (
    <Surface
      variant="card"
      radius={size === 'row' ? 'none' : 'lg'}
      edge="all"
      className="flex shrink-0 items-center justify-center"
      style={{ width: tile, height: tile, ...(size === 'row' && { borderRadius: LIST_ART_RADIUS }) }}
    >
      <img src={src} alt="" aria-hidden width={glyph} height={glyph} />
    </Surface>
  );
};
