import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';

export interface ChipProps {
  /** Short text (a size, a format); absent for an icon-only chip. */
  label?: string;
  icon?: LucideIcon;
  /** What an icon-only chip means (VoiceOver, and the hover tag on a Mac). */
  title?: string;
  /** The fact is a guess, not reported: a dashed outline. */
  estimated?: boolean;
}

/** A small outlined capsule for a fact about an item (18.85 GB · GGUF · vision, a tool call's argument); quiet, never a
 *  control. A long label is cut short at the row's width. */
export function Chip({ label, icon, title, estimated }: ChipProps) {
  return (
    <span
      title={title}
      aria-label={label ? undefined : title}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-muted text-subheadline text-muted',
        estimated && 'border-dashed',
        label ? 'min-w-0 px-2' : 'w-6 shrink-0 justify-center',
      )}
    >
      {icon && <Icon icon={icon} size="xs" />}
      {label && <span className="truncate">{label}</span>}
    </span>
  );
}
