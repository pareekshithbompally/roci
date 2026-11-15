import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { Icon } from './icon';

/** Canonical button: colour lives in `variant`, shape in `size`; call sites never pass colour or padding classes. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'accent' | 'ghost' | 'dangerGhost' | 'link' | 'ai';

export type ButtonSize = 'inline' | 'sm' | 'md' | 'icon' | 'iconSm' | 'iconXs';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-inverse text-inverse hover:opacity-90',
  secondary: 'bg-layer-2 text-primary hover:bg-layer-3',
  outline: 'bg-base text-primary shadow-input hover:bg-layer-1',
  danger: 'bg-danger text-on-accent hover:opacity-90',
  success: 'bg-success text-on-accent hover:opacity-90',
  accent: 'bg-accent text-on-accent hover:opacity-90',
  ghost: 'text-muted hover:text-primary hover:bg-hover',
  /** Quiet destructive (trash icons, Remove) — red only on hover */
  dangerGhost: 'text-faint hover:text-danger hover:bg-danger-subtle',
  /** Inline text action (Update, Explore models) — pair with size="inline" */
  link: 'text-accent hover:underline',
  /** AI moments only (meeting chat toggle) — the brand gradient */
  ai: 'bg-[image:var(--ai-gradient)] text-on-accent shadow-raised hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  /** No box — sits in a line of text */
  inline: 'text-callout gap-1',
  sm: 'h-7 px-3 text-callout rounded-md',
  md: 'h-8 px-4 text-body rounded-md',
  icon: 'h-8 w-8 rounded-full',
  iconSm: 'h-7 w-7 rounded-full',
  /** Inline row actions (tray rows, list rows) */
  iconXs: 'h-6 w-6 rounded-md',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';

/** Busy, not disabled: full opacity, clicks swallowed, `aria-busy` for assistive tech. */
const LOADING_CLASSES = 'cursor-progress';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** In-flight: a spinner leads the label and clicks are ignored. Pass no leading icon while loading. */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

/** The button recipe, for kit parts that style a third-party button (toast actions). */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size]);
}

export function Button({ variant = 'primary', size = 'sm', loading, className, type = 'button', ref, onClick, children, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonClasses(variant, size), loading && LOADING_CLASSES, className)}
      onClick={loading ? undefined : onClick}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      {...props}
    >
      {loading && <Icon icon={Loader2} size={size === 'md' ? 'sm' : 'xs'} className="animate-spin" />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'children'> {
  icon: LucideIcon;
  /** Accessible name — required: an icon alone has none. */
  label: string;
  size?: 'sm' | 'md';
  /** Solid glyph (stop / play / pause) */
  filled?: boolean;
  /** Rotate the glyph while work runs (Rescan, Sync) */
  spin?: boolean;
}

/** Icon-only button: ghost by default, always labelled. */
export function IconButton({ icon, label, size = 'md', variant = 'ghost', filled, spin, ...props }: IconButtonProps) {
  return (
    <Button variant={variant} size={size === 'md' ? 'icon' : 'iconSm'} aria-label={label} title={label} {...props}>
      <Icon icon={icon} size={size === 'md' ? 'md' : 'sm'} className={cn(filled && 'fill-current', spin && 'animate-spin')} />
    </Button>
  );
}
