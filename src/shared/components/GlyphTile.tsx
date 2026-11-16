/** A bare glyph image on an app-icon-sized raised tile, so it sits at the same visual weight as the app icons beside it. */

import React from 'react';
import { Surface } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';

const TILE = UI_CONFIG.glyphTile;

export const GlyphTile: React.FC<{ src: string }> = ({ src }) => (
  <Surface
    variant="card"
    radius="lg"
    edge="all"
    className="flex shrink-0 items-center justify-center"
    style={{ width: TILE.tile, height: TILE.tile }}
  >
    <img src={src} alt="" aria-hidden width={TILE.glyph} height={TILE.glyph} />
  </Surface>
);
