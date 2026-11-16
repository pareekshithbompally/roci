import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';
import { TONE_CLASSES, type TextTone } from './text';

/** The single way Lucide glyphs render: one stroke weight, the shared size scale, and a colour role via `tone`. */
export const ICON_STROKE_WIDTH = 1.5;

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Pixel edge per icon size; other glyph-like images (app icons) size from the same scale. */
export const ICON_SIZE_PX: Record<IconSize, number> = {
  xs: UI_CONFIG.size.icon.xsmall,
  sm: UI_CONFIG.size.icon.small,
  md: UI_CONFIG.size.icon.medium,
  lg: UI_CONFIG.size.icon.large,
  xl: UI_CONFIG.size.icon.xlarge,
};

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  tone?: TextTone;
  /** Override the default stroke weight (rare — keep the app on one weight). */
  strokeWidth?: number;
  /** Layout/motion only (shrink-0, animate-spin, fill-current…). */
  className?: string;
  /** Accessible name. When omitted, the icon is aria-hidden (decorative). */
  label?: string;
}

export function Icon({ icon: IconComponent, size = 'md', tone = 'inherit', strokeWidth = ICON_STROKE_WIDTH, className, label }: IconProps) {
  return (
    <IconComponent
      size={ICON_SIZE_PX[size]}
      strokeWidth={strokeWidth}
      className={cn(TONE_CLASSES[tone], className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
