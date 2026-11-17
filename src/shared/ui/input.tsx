import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { FIELD } from './recipes';
import { Icon } from './icon';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Leading glyph (search, link…) */
  icon?: LucideIcon;
  ref?: React.Ref<HTMLInputElement>;
}

/** Canonical single-line text field. */
export function Input({ icon, className, ref, ...props }: InputProps) {
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
