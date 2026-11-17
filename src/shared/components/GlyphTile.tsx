/** A bare glyph image on a raised white tile: app-icon size on choice cards, icon-tile size in settings rows. */

import React from 'react';
import { ICON_SIZE_PX, ICON_TILE_PX, ICON_TILE_RADIUS, Surface } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

const CHOICE = UI_CONFIG.glyphTile;
const ROW = { tile: ICON_TILE_PX, glyph: ICON_SIZE_PX.xs };

export const GlyphTile: React.FC<{ src: string; size?: 'choice' | 'row' }> = ({ src, size = 'choice' }) => {
  const { tile, glyph } = size === 'row' ? ROW : CHOICE;
  return (
    <Surface
      variant="card"
      radius={size === 'row' ? 'none' : 'lg'}
      edge="all"
      className="flex shrink-0 items-center justify-center"
      style={{ width: tile, height: tile, ...(size === 'row' && { borderRadius: ICON_TILE_RADIUS }) }}
    >
      <img src={src} alt="" aria-hidden width={glyph} height={glyph} />
    </Surface>
  );
};
