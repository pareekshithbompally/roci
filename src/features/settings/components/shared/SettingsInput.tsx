import React, { forwardRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import { Input } from '@shared/ui';

/** Parse markdown-style [text](url) links into React elements */
function renderWithLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return part;
    const [, label, href] = match;
    return (
      <a
        key={i}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          open(href).catch(() => window.open(href, '_blank', 'noopener,noreferrer'));
        }}
        className={`${TEXT.link} hover:underline`}
      >
        {label}
      </a>
    );
  });
}

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
        <Input
          ref={ref}
          className={`${icon ? 'pl-9' : ''} ${actions ? 'pr-16' : ''} ${className ?? ''}`}
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
          {renderWithLinks(helper)}
        </p>
      )}
    </div>
  ),
);

SettingsInput.displayName = 'SettingsInput';
