/** A raised card that does one thing on click: icon, title, one-line description; hover tint never shows through. */

import React from 'react';
import { Surface, Text } from '@shared/ui';
import { activateOnKey } from '@shared/utils/activateOnKey';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  /** A line under the description for the card's current state (checking, needs System Settings, ready). */
  status?: React.ReactNode;
  /** Can't be used here; the description or status says why. */
  disabled?: boolean;
  /** `brand`: copper-washed, for a choice on a neutral panel (onboarding). */
  tone?: 'default' | 'brand';
}

export const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick, status, disabled, tone = 'default' }) => (
  <Surface
    variant={tone === 'brand' ? 'brand' : 'card'}
    radius="lg"
    interactive={!disabled}
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled || undefined}
    onClick={disabled ? undefined : onClick}
    onKeyDown={disabled ? undefined : activateOnKey(onClick)}
    className="w-full p-4"
  >
    {/* Icon centred on the whole card, as System Settings centres a row's app icon. */}
    <div className="flex items-center gap-3">
      <Text as="div" tone={disabled ? 'faint' : 'muted'} className="shrink-0">{icon}</Text>
      <div className="min-w-0 flex-1 space-y-1 text-left">
        <Text as="p" variant="bodyStrong" tone={disabled ? 'faint' : 'primary'}>{title}</Text>
        <Text as="p" variant="helper" tone={disabled ? 'faint' : 'muted'}>{description}</Text>
        {status}
      </div>
    </div>
  </Surface>
);
