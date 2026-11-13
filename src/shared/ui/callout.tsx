import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { SURFACE, BORDER, TEXT, RADIUS, SPACING } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success' | 'neutral';

interface CalloutProps {
  variant?: CalloutVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<CalloutVariant, { surface: string; border: string; text: string; defaultIcon: React.ReactNode }> = {
  info: {
    surface: SURFACE.infoCallout,
    border: BORDER.infoCallout,
    text: TEXT.infoCallout,
    defaultIcon: <Info className={`w-4 h-4 ${TEXT.link} shrink-0`} />,
  },
  warning: {
    surface: SURFACE.warningCallout,
    border: BORDER.warningCallout,
    text: TEXT.warningCallout,
    defaultIcon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
  },
  error: {
    surface: SURFACE.errorCallout,
    border: BORDER.errorCallout,
    text: TEXT.errorCallout,
    defaultIcon: <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
  },
  success: {
    surface: SURFACE.successCallout,
    border: BORDER.successCallout,
    text: TEXT.successCallout,
    defaultIcon: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />,
  },
  neutral: {
    surface: SURFACE.subtle,
    border: BORDER.default,
    text: TEXT.faint,
    defaultIcon: <Info className={`w-4 h-4 ${TEXT.faint} shrink-0`} />,
  },
};

export const Callout: React.FC<CalloutProps> = ({
  variant = 'info',
  icon,
  children,
}) => {
  const styles = variantStyles[variant];

  return (
    <div className={`flex items-start gap-2.5 ${SPACING.callout} ${RADIUS.md} ${styles.surface} border ${styles.border}`}>
      <div className="mt-0.5">{icon ?? styles.defaultIcon}</div>
      <div className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${styles.text} flex-1`}>
        {children}
      </div>
    </div>
  );
};
