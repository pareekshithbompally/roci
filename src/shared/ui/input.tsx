import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { FIELD } from './recipes';
import { Icon } from './icon';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Leading glyph (search, link…) */
  icon?: LucideIcon;
  /** Buttons inside the field's end (show, copy): laid out beside the text, so the text never runs under them. */
  trailing?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

/** Canonical single-line text field. */
export function Input({ icon, trailing, className, ref, ...props }: InputProps) {
  if (trailing) {
    // The field look moves to the frame; the input fills what the buttons leave.
    return (
      <div className={cn(FIELD, 'flex h-control-md items-center gap-1 pr-1 focus-within:ring-2 focus-within:ring-focus', className)}>
        <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" {...props} />
        <div className="flex shrink-0 items-center">{trailing}</div>
      </div>
    );
  }
  const field = <input ref={ref} className={cn(FIELD, 'h-control-md', icon && 'pl-8', className)} {...props} />;
  if (!icon) return field;
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 flex">
        <Icon icon={icon} size="xs" tone="faint" />
      </span>
      {field}
    </div>
  );
}

const TEXTAREA_VARIANT = {
  text: cn(FIELD, 'py-2 resize-none'),
  /** JSON / config editing */
  code: cn(FIELD, 'py-2 font-mono text-callout min-h-72 resize-y'),
  /** No field chrome — sits inside a field-like Surface (chat composer) */
  bare: 'w-full bg-transparent text-reading text-primary placeholder:text-faint outline-none resize-none',
} as const;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: keyof typeof TEXTAREA_VARIANT;
  ref?: React.Ref<HTMLTextAreaElement>;
}

/** Canonical multi-line text field (same recipe as Input). */
export function Textarea({ variant = 'text', className, ref, ...props }: TextareaProps) {
  // `block`: an inline textarea sits on a text baseline and leaves a gap under it, so rows around it don't align.
  return <textarea ref={ref} className={cn('block', TEXTAREA_VARIANT[variant], className)} {...props} />;
}
