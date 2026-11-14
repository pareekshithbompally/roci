import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Icon } from './icon';

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success' | 'neutral';

interface CalloutProps {
  variant?: CalloutVariant;
  icon?: React.ReactNode;
  /** Trailing control (Retry, Transcribe…), vertically centred on the copy. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

const VARIANTS: Record<CalloutVariant, { box: string; icon: LucideIcon; iconTone: string }> = {
  info: { box: 'bg-info-subtle border-info text-info', icon: Info, iconTone: 'text-info' },
  warning: { box: 'bg-warning-subtle border-warning text-warning', icon: AlertTriangle, iconTone: 'text-warning' },
  error: { box: 'bg-danger-subtle border-danger text-danger', icon: AlertCircle, iconTone: 'text-danger' },
  success: { box: 'bg-success-subtle border-success text-success', icon: CheckCircle2, iconTone: 'text-success' },
  neutral: { box: 'bg-layer-1 border-muted text-muted', icon: Info, iconTone: 'text-faint' },
};

/** Inline notice: tinted box, state icon, helper-size copy. */
export function Callout({ variant = 'info', icon, action, children }: CalloutProps) {
  const v = VARIANTS[variant];
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-md border text-callout ${v.box}`}>
      <div className="mt-0.5 shrink-0">{icon ?? <Icon icon={v.icon} size="sm" className={v.iconTone} />}</div>
      <div className="flex-1">{children}</div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
