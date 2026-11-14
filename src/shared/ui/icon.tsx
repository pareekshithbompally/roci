import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';
import { TONE_CLASSES, type TextTone } from './text';

/**
 * Canonical icon — the single way Lucide glyphs are rendered app-wide.
 * One stroke weight (macOS-native feel), the shared size scale, and a colour
 * role via `tone` (defaults to inheriting the surrounding text colour).
 *
 *   <Icon icon={Check} size="sm" tone="success" />
 */
export const ICON_STROKE_WIDTH = 1.5;

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_TO_PX: Record<IconSize, number> = {
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
      size={SIZE_TO_PX[size]}
      strokeWidth={strokeWidth}
      className={cn(TONE_CLASSES[tone], className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}
