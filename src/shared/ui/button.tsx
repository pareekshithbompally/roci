import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './utils';
import { platform } from '@platform/index';
import { Icon, type IconSize } from './icon';
import { LIST_ART_PX } from './icon-tile';
import { UI_CONFIG } from '@config/ui.config';

/** Canonical button: colour lives in `variant`, shape in `size`; call sites never pass colour or padding classes. Square
 *  sizes never shrink: a crowded row can't squeeze a round button into a pill. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'record' | 'dangerTint' | 'success' | 'accentTint' | 'ghost' | 'dangerGhost' | 'link' | 'ai' | 'bar';

export type ButtonSize = 'inline' | 'toolbar' | 'sm' | 'md' | 'lg' | 'icon' | 'iconSm' | 'iconXs' | 'fab';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /** The main action, in the brand colour on every device; plain grey while it can't be used (Messages' send). */
  primary: 'bg-accent text-on-accent hover:opacity-90 disabled:bg-control disabled:text-faint disabled:opacity-100',
  secondary: 'bg-layer-2 text-primary hover:bg-layer-3',
  /** The system push button (macOS 26 / iOS 26): a filled control-grey capsule, no outline. */
  outline: 'bg-control text-primary hover:bg-control-hover',
  danger: 'bg-danger text-on-accent hover:opacity-90',
  /** Start recording: the system red glyph on no fill (the composer's record dot). */
  record: 'text-danger hover:bg-hover',
  /** A screen's one red action, as a tint (Stop a recording, beside the Recording badge in the same red). */
  dangerTint: 'bg-danger-subtle text-danger hover:opacity-80',
  success: 'bg-success text-on-accent hover:opacity-90',
  /** The next step, called out quietly (Resume a paused recording). */
  accentTint: 'bg-accent-wash text-accent hover:opacity-80',
  ghost: 'text-muted hover:text-primary hover:bg-hover',
  /** Quiet destructive (trash icons, Remove) — red only on hover */
  dangerGhost: 'text-faint hover:text-danger hover:bg-danger-subtle',
  /** Inline text action (Update, Explore models) — pair with size="inline" */
  link: 'text-accent hover:underline',
  /** iOS bar button: a round, translucent, softly lifted button floating over content (top bar, sheet Back / Close). */
  bar: cn(
    'bg-bar backdrop-blur-xl text-primary shadow-bar hover:bg-tint-hover',
    platform.hasTouchScreen && 'transition motion-safe:active:scale-95',
  ),
  /** AI moments only (meeting chat toggle) — the brand gradient */
  ai: 'bg-[image:var(--ai-gradient)] text-on-accent shadow-raised hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  /** No box — sits in a line of text; on touch screens an invisible overlay widens the tap area without moving the text */
  inline: cn('text-callout gap-1', platform.hasTouchScreen && "relative after:absolute after:-inset-2 after:content-['']"),
  /** Dense control in a toolbar row (composer): tight padding, at least square (control-sm) so an icon alone fits */
  toolbar: 'h-control-sm min-w-control-sm shrink-0 px-1.5 text-callout rounded-md',
  sm: 'h-control-sm px-3 text-callout rounded-full',
  md: 'h-control-md px-4 text-body rounded-full',
  /** A screen's main action (first-run Continue): iOS prominent button height. */
  lg: 'h-control-lg px-6 text-body rounded-full',
  icon: 'h-control-md w-control-md shrink-0 rounded-full',
  iconSm: 'h-control-sm w-control-sm shrink-0 rounded-full',
  /** Inline row actions (tray rows, list rows) */
  iconXs: 'h-control-xs w-control-xs shrink-0 rounded-md',
  /** Round 44 pt action: the meeting chat's floating button, the iOS sheet's Back and Close */
  fab: 'h-11 w-11 shrink-0 rounded-full',
};

const BASE_CLASSES = cn(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed',
  // Touch: an iOS button dims the moment a finger lands, not on release.
  platform.hasTouchScreen && 'active:opacity-60',
);

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

export type IconButtonProps = Omit<ButtonProps, 'size' | 'children'> & {
  /** Accessible name — required: an icon alone has none. */
  label: string;
  size?: 'xs' | 'toolbar' | 'sm' | 'md' | 'fab';
  /** Solid glyph (stop / play / pause) */
  filled?: boolean;
  /** Rotate the glyph while work runs (Rescan, Sync) */
  spin?: boolean;
} & (
  | { icon: LucideIcon; image?: never; appIcon?: never }
  /** An image instead of a glyph (an app's icon, Show in Finder), at list-art size; `appIcon`: a macOS app icon, whose body
   *  sits inside padding, scaled so the body is list-art size. */
  | { image: string; appIcon?: boolean; icon?: never }
);

/** Each icon-button size as its button shape and glyph size; toolbar glyphs match the labelled controls beside them. */
const ICON_BUTTON_SIZES: Record<NonNullable<IconButtonProps['size']>, { button: ButtonSize; icon: IconSize }> = {
  /** Inside a compact (`sm`) field, beside its text (show, copy). */
  xs: { button: 'iconXs', icon: 'xs' },
  toolbar: { button: 'toolbar', icon: 'xs' },
  sm: { button: 'iconSm', icon: 'sm' },
  md: { button: 'icon', icon: 'md' },
  fab: { button: 'fab', icon: 'md' },
};

export function IconButton({ icon, image, appIcon, label, size = 'md', variant = 'ghost', filled, spin, ...props }: IconButtonProps) {
  const shape = ICON_BUTTON_SIZES[size];
  const imagePx = appIcon ? Math.round(LIST_ART_PX / UI_CONFIG.appIconBody) : LIST_ART_PX;
  return (
    <Button variant={variant} size={shape.button} aria-label={label} title={label} {...props}>
      {image
        ? <img src={image} alt="" aria-hidden width={imagePx} height={imagePx} className="max-w-none shrink-0" />
        : icon && <Icon icon={icon} size={shape.icon} className={cn(filled && 'fill-current', spin && 'animate-spin')} />}
    </Button>
  );
}
