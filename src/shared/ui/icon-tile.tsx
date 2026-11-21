import type React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { ICON_SIZE_PX, ICON_STROKE_WIDTH } from './icon';

/** List icons (Settings rows, capabilities, usage): one icon step on every device, so a logo beside them (providers, models) matches. */
const LIST_ICON_PX = ICON_SIZE_PX.sm;
/** App-icon-shaped art in a list row (Settings panes, Mac apps, integrations): Apple's size, larger than a glyph. */
export const LIST_ART_PX = platform.hasTouchScreen ? UI_CONFIG.listArt.touch : UI_CONFIG.listArt.desktop;
/** Corner radius in px for square art at list-art size that isn't already shaped (brand squares, glyph tiles). */
export const LIST_ART_RADIUS = Math.round(LIST_ART_PX * 0.22);

/** A list icon's edge in px on this device, so logos beside list icons (providers, models) match them. */
export const ICON_TILE_PX = LIST_ICON_PX;

/** A line glyph (Lucide) or a Simple Icons brand mark, in currentColor. */
export type TileGlyph = React.ComponentType<{ size?: number | string; strokeWidth?: number | string; title?: string }>;

/** A line glyph, or an icon image (a Settings pane's own art). */
export type IconTileProps = { icon: TileGlyph; image?: never } | { image: string; icon?: never };

/** A list row's icon (iOS / macOS Settings style): a plain line glyph in the text colour at the list icon size, or an icon image at Apple's list-art size. */
export function IconTile({ icon: Glyph, image }: IconTileProps) {
  if (image) return <img src={image} alt="" aria-hidden width={LIST_ART_PX} height={LIST_ART_PX} className="shrink-0" />;
  if (!Glyph) return null;
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center text-primary">
      <Glyph size={LIST_ICON_PX} strokeWidth={ICON_STROKE_WIDTH} />
    </span>
  );
}
