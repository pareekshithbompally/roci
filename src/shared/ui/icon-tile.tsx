import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';
import { UI_CONFIG, type TileTint } from '@config/ui.config';
import { platform } from '@platform/index';

/** Settings icon (System Settings / iOS Settings style): a white glyph on a rounded square in an Apple system hue. */
const TINT: Record<TileTint, string> = {
  grey: 'bg-tile-grey',
  blue: 'bg-tile-blue',
  indigo: 'bg-tile-indigo',
  purple: 'bg-tile-purple',
  pink: 'bg-tile-pink',
  red: 'bg-tile-red',
  orange: 'bg-tile-orange',
  green: 'bg-tile-green',
  teal: 'bg-tile-teal',
};

const { stroke, touch, ...mac } = UI_CONFIG.iconTile;
const BOX = platform.hasTouchScreen ? touch : mac;

export interface IconTileProps {
  icon: LucideIcon;
  tint: TileTint;
}

export function IconTile({ icon, tint }: IconTileProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center text-on-accent', TINT[tint])}
      style={{ width: BOX.tile, height: BOX.tile, borderRadius: BOX.radius }}
    >
      <Icon icon={icon} size="xs" strokeWidth={stroke} />
    </span>
  );
}
