import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';
import { useFormFactor } from '@platform/formFactor';

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success' | 'neutral';

interface CalloutProps {
  variant?: CalloutVariant;
  icon?: React.ReactNode;
  /** Trailing control (Retry, Transcribe…), vertically centred on the copy. */
  action?: React.ReactNode;
  /** A notice in two parts: its state, then a line on it. A phone shows the state alone in a compact row (the screen
   *  below already says the rest); a Mac shows both. */
  title?: string;
  detail?: string;
  children?: React.ReactNode;
}

const VARIANTS: Record<CalloutVariant, { box: string; icon: LucideIcon; iconTone: string }> = {
  info: { box: 'bg-info-subtle border-info text-info', icon: Info, iconTone: 'text-info' },
  warning: { box: 'bg-warning-subtle border-warning text-warning', icon: AlertTriangle, iconTone: 'text-warning' },
  error: { box: 'bg-danger-subtle border-danger text-danger', icon: AlertCircle, iconTone: 'text-danger' },
  success: { box: 'bg-success-subtle border-success text-success', icon: CheckCircle2, iconTone: 'text-success' },
  neutral: { box: 'bg-layer-1 border-muted text-muted', icon: Info, iconTone: 'text-faint' },
};

/** Inline notice: tinted box, state icon, helper-size copy; on a phone a structured notice is one compact row. */
export function Callout({ variant = 'info', icon, action, title, detail, children }: CalloutProps) {
  const v = VARIANTS[variant];
  const compact = useFormFactor() === 'phone' && !!title;
  return (
    <div className={cn('flex gap-2.5 rounded-md border text-callout', compact ? 'items-center px-4 py-2' : 'items-start px-4 py-3', v.box)}>
      <div className={cn('shrink-0', !compact && 'mt-0.5')}>{icon ?? <Icon icon={v.icon} size="sm" className={v.iconTone} />}</div>
      <div className="min-w-0 flex-1">
        {title && <Text as="p" variant="bodyStrong" tone="inherit" truncate={compact}>{title}</Text>}
        {detail && !compact && <Text as="p" variant="helper" tone="inherit">{detail}</Text>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
