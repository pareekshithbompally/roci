import React, { forwardRef } from 'react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT, COMPONENT, SPACING } from '@config/theme.config';

interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const SettingsInput = forwardRef<HTMLInputElement, SettingsInputProps>(
  ({ label, helper, error, icon, actions, className, ...props }, ref) => (
    <div className="space-y-2">
      {label && (
        <label className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.muted}`}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={`w-full ${SPACING.input} ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput} ${COMPONENT.inputDisabled} ${
            icon ? 'pl-9' : ''
          } ${actions ? 'pr-16' : ''} ${className ?? ''}`}
          {...props}
        />
        {actions && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {actions}
          </div>
        )}
      </div>
      {error && (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error}`}>
          {error}
        </p>
      )}
      {!error && helper && (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
          {helper}
        </p>
      )}
    </div>
  ),
);

SettingsInput.displayName = 'SettingsInput';
