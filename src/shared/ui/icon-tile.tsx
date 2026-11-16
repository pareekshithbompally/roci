import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';

/** App-style glyph tile (permission and setup rows): a rounded square in a role colour around a glyph. */
const TONE = {
  accent: 'bg-accent text-on-accent',
  info: 'bg-info text-on-accent',
  danger: 'bg-danger text-on-accent',
  success: 'bg-success text-on-accent',
  warning: 'bg-warning text-on-accent',
  neutral: 'bg-layer-3 text-primary',
} as const;

export type IconTileTone = keyof typeof TONE;

export interface IconTileProps {
  icon: LucideIcon;
  tone?: IconTileTone;
}

export function IconTile({ icon, tone = 'neutral' }: IconTileProps) {
  return (
    <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
      <Icon icon={icon} size="sm" tone="inherit" />
    </span>
  );
}
