import type React from 'react';
import { cn } from './utils';

/** The system switch: WebKit draws the platform's own control for `<input type="checkbox" switch>` (iOS UISwitch, macOS NSSwitch). */
export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Kept for callers; the system decides the size. */
  size?: 'sm' | 'md';
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** `switch` is a WebKit attribute React passes through as is. */
const SYSTEM_SWITCH = { switch: '' } as React.InputHTMLAttributes<HTMLInputElement>;

export function Switch({ checked, onCheckedChange, disabled, id, className, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      {...SYSTEM_SWITCH}
      id={id}
      aria-label={ariaLabel}
      checked={!!checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn('shrink-0 cursor-pointer [accent-color:var(--bg-accent)] disabled:cursor-not-allowed', className)}
    />
  );
}
