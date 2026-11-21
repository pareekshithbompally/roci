import React, { forwardRef } from 'react';
import { openUrl } from '@services/tauri';
import type { LucideIcon } from 'lucide-react';
import { Button, Input, Text } from '@shared/ui';

/** Parse markdown-style [text](url) links into React elements (field help, section footers). */
export function renderWithLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return part;
    const [, label, href] = match;
    return (
      <Button
        key={i}
        variant="link"
        size="inline"
        onClick={() => void openUrl(href)}
      >
        {label}
      </Button>
    );
  });
}

interface SettingsInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helper?: string;
  error?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export const SettingsInput = forwardRef<HTMLInputElement, SettingsInputProps>(
  ({ label, helper, error, icon, actions, className, ...props }, ref) => (
    <div className="space-y-2">
      {label && (
        <Text as="label" variant="bodyStrong" tone="muted">
          {label}
        </Text>
      )}
      <Input ref={ref} icon={icon} trailing={actions} className={className} {...props} />
      {error && (
        <Text as="p" variant="helper" tone="danger">
          {error}
        </Text>
      )}
      {!error && helper && (
        <Text as="p" variant="helper" tone="faint">
          {renderWithLinks(helper)}
        </Text>
      )}
    </div>
  ),
);

SettingsInput.displayName = 'SettingsInput';
