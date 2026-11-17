import type React from 'react';
import { cn } from './utils';
import { ICON_SIZE_PX } from './icon';
import { UI_CONFIG, type TileTint } from '@config/ui.config';
import { platform } from '@platform/index';

/** Settings icon (System Settings / iOS Settings style): a white glyph on a rounded square in a mineral hue. */
const TINT: Record<TileTint, string> = {
  graphite: 'bg-tile-graphite',
  plum: 'bg-tile-plum',
  slate: 'bg-tile-slate',
  clay: 'bg-tile-clay',
  sage: 'bg-tile-sage',
  teal: 'bg-tile-teal',
  rose: 'bg-tile-rose',
  ochre: 'bg-tile-ochre',
  copper: 'bg-tile-copper',
};

const { stroke, touch, ...mac } = UI_CONFIG.iconTile;
const BOX = platform.hasTouchScreen ? touch : mac;

/** A tile's edge in px on this device, so logos beside tiles (providers, models) match them. */
export const ICON_TILE_PX = BOX.tile;

/** A Lucide glyph or a Simple Icons brand mark: both draw in currentColor at a given size. */
export type TileGlyph = React.ComponentType<{ size?: number | string; strokeWidth?: number | string; title?: string }>;

export interface IconTileProps {
  icon: TileGlyph;
  tint: TileTint;
}

export function IconTile({ icon: Glyph, tint }: IconTileProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center text-on-accent', TINT[tint])}
      style={{ width: BOX.tile, height: BOX.tile, borderRadius: BOX.radius }}
    >
      <Glyph size={ICON_SIZE_PX.xs} strokeWidth={stroke} title="" />
    </span>
  );
}
