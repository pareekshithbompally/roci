import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';

export interface ChipProps {
  /** Short text (a size, a format); absent for an icon-only chip. */
  label?: string;
  icon?: LucideIcon;
  /** What an icon-only chip means (VoiceOver, and the hover tag on a Mac). */
  title?: string;
}

/** A small outlined capsule for a fact about an item (18.85 GB · GGUF · vision); quiet, never a control. */
export function Chip({ label, icon, title }: ChipProps) {
  return (
    <span
      title={title}
      aria-label={label ? undefined : title}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-muted text-subheadline text-muted',
        label ? 'px-2' : 'w-6 justify-center',
      )}
    >
      {icon && <Icon icon={icon} size="xs" />}
      {label}
    </span>
  );
}
