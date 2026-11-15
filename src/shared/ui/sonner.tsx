import type { CSSProperties } from 'react';
import { Toaster as Sonner, toast } from 'sonner';
import { UI_CONFIG } from '@config/ui.config';
import { buttonClasses } from './button';
import { Dot } from './surface';

/** In-app toasts: Sonner themed via its `classNames` hooks; render `<Toaster />` once, post with `showToast`. */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  /** The app the action opens (an image path, e.g. `UI_CONFIG.appIcons.finder`). */
  icon?: string;
  onClick: () => void;
}

const TONE_ICONS = {
  success: <Dot tone="success" size="xs" />,
  error: <Dot tone="danger" size="xs" />,
  warning: <Dot tone="warning" size="xs" />,
  info: <Dot tone="info" size="xs" />,
};

const CLASS_NAMES = {
  // Sonner stacks toasts absolutely inside its max-width toaster: hug the text, pinned right.
  toast: 'right-0 flex w-max max-w-full items-center gap-2.5 rounded-lg bg-raised-glass px-3 py-2.5 shadow-floating backdrop-blur-xl',
  icon: 'flex shrink-0',
  content: 'min-w-0 flex-1',
  // One line each: long text (a file path) truncates instead of growing the toast.
  title: 'truncate text-body text-primary',
  description: 'truncate text-callout text-muted',
  actionButton: `${buttonClasses('outline', 'sm')} shrink-0`,
};

const { toast: CONFIG } = UI_CONFIG;

export function Toaster() {
  return (
    <Sonner
      position={CONFIG.position}
      offset={CONFIG.offset}
      gap={CONFIG.gap}
      visibleToasts={CONFIG.visible}
      duration={CONFIG.durationMs}
      icons={TONE_ICONS}
      style={{ '--width': `${CONFIG.maxWidthPx}px` } as CSSProperties}
      toastOptions={{ unstyled: true, classNames: CLASS_NAMES }}
    />
  );
}

function actionLabel({ label, icon }: ToastAction) {
  if (!icon) return label;
  return (
    <>
      <img src={icon} alt="" aria-hidden className="size-4" />
      {label}
    </>
  );
}

/** One line, a tone dot, and optionally a button. */
export function showToast(message: string, tone: ToastTone = 'info', action?: ToastAction): void {
  const options = action
    ? { action: { label: actionLabel(action), onClick: action.onClick }, duration: CONFIG.actionDurationMs }
    : {};
  toast[tone](message, options);
}

export function dismissToast(id?: string): void {
  toast.dismiss(id);
}
