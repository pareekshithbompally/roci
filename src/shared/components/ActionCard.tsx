/** A raised card that does one thing on click: icon, title, one line under it; every card the same height. */

import React from 'react';
import { Surface, Text } from '@shared/ui';
import { activateOnKey } from '@shared/utils/activateOnKey';
import { UI_CONFIG } from '@config/ui.config';

const SLOT = UI_CONFIG.choiceIconSlot;

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  /** The card's current state (checking, needs System Settings, unavailable); takes the description's line. */
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
      {/* One slot width for every card, icon centred in it, so titles line up whatever the icon's width. */}
      <Text as="div" tone={disabled ? 'faint' : 'muted'} className="flex shrink-0 items-center justify-center" style={{ width: SLOT.width, height: SLOT.height }}>
        {icon}
      </Text>
      <div className="min-w-0 flex-1 space-y-1 text-left">
        <Text as="p" variant="bodyStrong" tone={disabled ? 'faint' : 'primary'} truncate>{title}</Text>
        {status ?? <Text as="p" variant="helper" tone={disabled ? 'faint' : 'muted'} truncate>{description}</Text>}
      </div>
    </div>
  </Surface>
);
