import React from 'react';
import { cn } from './utils';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';

/**
 * Canonical button. Layout lives in `size`, color in `variant` — never mix
 * ad-hoc padding or colors at the call site.
 *
 * - sm/md: text buttons (settings, dialogs, forms). md ≈ old px-3.5/py-2 sites.
 * - icon/iconSm: round icon buttons (toolbar, send, close, toggles).
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'success'
  | 'accent'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'icon' | 'iconSm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: `bg-paper-900 dark:bg-night-100 text-white dark:text-night-900 hover:bg-paper-800 dark:hover:bg-night-200`,
  secondary: `bg-paper-200 dark:bg-night-800 text-paper-800 dark:text-night-300 hover:bg-paper-300 dark:hover:bg-night-750`,
  outline: `border ${BORDER.strong} ${TEXT.primary} ${SURFACE.hoverSubtle}`,
  danger: `bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400 text-white shadow-lg shadow-red-500/20`,
  success: `bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400 text-white`,
  accent: `bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 text-white`,
  ghost: `${TEXT.muted} hover:text-paper-900 dark:hover:text-night-100 ${SURFACE.hoverSubtle}`,
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: `px-3 py-1.5 text-[12.5px] leading-[1.4] justify-center ${RADIUS.md}`,
  md: `px-4 py-2 text-sm leading-[1.4] justify-center ${RADIUS.md}`,
  icon: `h-8 w-8 p-0 rounded-full justify-center shadow-lg`,
  iconSm: `h-7 w-7 p-0 rounded-full justify-center`,
};

const BASE_CLASSES =
  'inline-flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ variant = 'primary', size = 'sm', className, type = 'button', ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}
