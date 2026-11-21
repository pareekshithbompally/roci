import type React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { ICON_SIZE_PX, ICON_STROKE_WIDTH } from './icon';

/** List icons (Settings rows, capabilities, usage): one icon step on every device, so a logo beside them (providers, models) matches. */
const LIST_ICON_PX = ICON_SIZE_PX.sm;
/** An icon image in a list row: Apple's size, larger than a glyph. */
const LIST_ART_PX = platform.hasTouchScreen ? UI_CONFIG.listArt.touch : UI_CONFIG.listArt.desktop;

/** A list icon's edge in px on this device, so logos beside list icons (providers, models) match them. */
export const ICON_TILE_PX = LIST_ICON_PX;
/** Corner radius in px for images shown in a list icon's slot (app icons, logos). */
export const ICON_TILE_RADIUS = Math.round(LIST_ICON_PX * 0.22);

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
