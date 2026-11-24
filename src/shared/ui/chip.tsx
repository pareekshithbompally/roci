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

/** A small outlined capsule for a fact about an item (18.85 GB · GGUF, a tool call's argument); quiet, never a control. A
 *  long label is cut short at the row's width. Icon-only (a model can see, use tools…) it is the bare glyph, muted, as
 *  Apple marks a row; a guess is fainter. */
export function Chip({ label, icon, title, estimated }: ChipProps) {
  if (!label) {
    return (
      <span title={title} aria-label={title} className={cn('inline-flex shrink-0', estimated ? 'text-faint' : 'text-muted')}>
        {icon && <Icon icon={icon} size="xs" />}
      </span>
    );
  }
  return (
    <span
      title={title}
      aria-label={label ? undefined : title}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-muted text-subheadline text-muted',
        estimated && 'border-dashed',
        'min-w-0 px-2',
      )}
    >
      {icon && <Icon icon={icon} size="xs" />}
      <span className="truncate">{label}</span>
    </span>
  );
}
