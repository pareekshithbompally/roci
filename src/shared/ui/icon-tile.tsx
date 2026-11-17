import type React from 'react';
import { ICON_SIZE_PX, ICON_STROKE_WIDTH } from './icon';

/** List icons (Settings rows, capabilities, usage): one icon step on every device, so a logo beside them (providers, models) matches. */
const LIST_ICON_PX = ICON_SIZE_PX.sm;

/** A list icon's edge in px on this device, so logos beside list icons (providers, models) match them. */
export const ICON_TILE_PX = LIST_ICON_PX;
/** Corner radius in px for images shown in a list icon's slot (app icons, logos). */
export const ICON_TILE_RADIUS = Math.round(LIST_ICON_PX * 0.22);

/** A line glyph (Lucide) or a Simple Icons brand mark, in currentColor. */
export type TileGlyph = React.ComponentType<{ size?: number | string; strokeWidth?: number | string; title?: string }>;

export interface IconTileProps {
  icon: TileGlyph;
}

/** A list row's icon (iOS / macOS Settings style): a plain line glyph in the text colour, at the list icon size. */
export function IconTile({ icon: Glyph }: IconTileProps) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center text-primary">
      <Glyph size={LIST_ICON_PX} strokeWidth={ICON_STROKE_WIDTH} />
    </span>
  );
}
