import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { platform } from '@platform/index';
import { Icon, type IconSize } from './icon';

/** Canonical button: colour lives in `variant`, shape in `size`; call sites never pass colour or padding classes. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'accent' | 'ghost' | 'dangerGhost' | 'link' | 'ai' | 'bar';

export type ButtonSize = 'inline' | 'toolbar' | 'sm' | 'md' | 'lg' | 'icon' | 'iconSm' | 'iconXs' | 'fab';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-inverse text-inverse hover:opacity-90',
  secondary: 'bg-layer-2 text-primary hover:bg-layer-3',
  /** The system push button (macOS 26 / iOS 26): a filled control-grey capsule, no outline. */
  outline: 'bg-control text-primary hover:bg-control-hover',
  danger: 'bg-danger text-on-accent hover:opacity-90',
  success: 'bg-success text-on-accent hover:opacity-90',
  accent: 'bg-accent text-on-accent hover:opacity-90',
  ghost: 'text-muted hover:text-primary hover:bg-hover',
  /** Quiet destructive (trash icons, Remove) — red only on hover */
  dangerGhost: 'text-faint hover:text-danger hover:bg-danger-subtle',
  /** Inline text action (Update, Explore models) — pair with size="inline" */
  link: 'text-accent hover:underline',
  /** iOS bar button: a round, translucent, softly lifted button floating over content (top bar, sheet Back / Close). */
  bar: 'bg-raised-glass backdrop-blur-xl text-primary shadow-floating hover:bg-control-hover',
  /** AI moments only (meeting chat toggle) — the brand gradient */
  ai: 'bg-[image:var(--ai-gradient)] text-on-accent shadow-raised hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  /** No box — sits in a line of text; on touch screens an invisible overlay widens the tap area without moving the text */
  inline: cn('text-callout gap-1', platform.hasTouchScreen && "relative after:absolute after:-inset-2 after:content-['']"),
  /** Dense control in a toolbar row (composer): tight padding, at least square (control-sm) so an icon alone fits */
  toolbar: 'h-control-sm min-w-control-sm px-1.5 text-callout rounded-md',
  sm: 'h-control-sm px-3 text-callout rounded-full',
  md: 'h-control-md px-4 text-body rounded-full',
  /** A screen's main action (first-run Continue): iOS prominent button height. */
  lg: 'h-control-lg px-6 text-body rounded-full',
  icon: 'h-control-md w-control-md rounded-full',
  iconSm: 'h-control-sm w-control-sm rounded-full',
  /** Inline row actions (tray rows, list rows) */
  iconXs: 'h-control-xs w-control-xs rounded-md',
  /** Round 44 pt action: the meeting chat's floating button, the iOS sheet's Back and Close */
  fab: 'h-11 w-11 rounded-full',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';

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
  size?: 'toolbar' | 'sm' | 'md' | 'fab';
  /** Solid glyph (stop / play / pause) */
  filled?: boolean;
  /** Rotate the glyph while work runs (Rescan, Sync) */
  spin?: boolean;
}

/** Each icon-button size as its button shape and glyph size; toolbar glyphs match the labelled controls beside them. */
const ICON_BUTTON_SIZES: Record<NonNullable<IconButtonProps['size']>, { button: ButtonSize; icon: IconSize }> = {
  toolbar: { button: 'toolbar', icon: 'xs' },
  sm: { button: 'iconSm', icon: 'sm' },
  md: { button: 'icon', icon: 'md' },
  fab: { button: 'fab', icon: 'md' },
};

export function IconButton({ icon, label, size = 'md', variant = 'ghost', filled, spin, ...props }: IconButtonProps) {
  const shape = ICON_BUTTON_SIZES[size];
  return (
    <Button variant={variant} size={shape.button} aria-label={label} title={label} {...props}>
      <Icon icon={icon} size={shape.icon} className={cn(filled && 'fill-current', spin && 'animate-spin')} />
    </Button>
  );
}
