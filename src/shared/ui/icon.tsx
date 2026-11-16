import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';
import { platform } from '@platform/index';
import { TONE_CLASSES, type TextTone } from './text';

/** The single way Lucide glyphs render: one stroke weight, the shared size scale, and a colour role via `tone`. */
export const ICON_STROKE_WIDTH = 1.5;

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const ICON_STEPS = platform.hasTouchScreen ? UI_CONFIG.size.icon.touch : UI_CONFIG.size.icon;

/** Pixel edge per icon size (larger on touch screens); other glyph-like images (app icons) size from the same scale. */
export const ICON_SIZE_PX: Record<IconSize, number> = {
  xs: ICON_STEPS.xsmall,
  sm: ICON_STEPS.small,
  md: ICON_STEPS.medium,
  lg: ICON_STEPS.large,
  xl: ICON_STEPS.xlarge,
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
