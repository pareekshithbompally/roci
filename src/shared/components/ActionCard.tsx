/**
 * ActionCard — a raised card that does one thing when clicked (open a setup
 * page, start a flow): icon, title, one line of description. A button to
 * assistive tech; the hover tint shades the card without letting what's
 * behind it show through.
 */

import React from 'react';
import { Surface, Text } from '@shared/ui';
import { activateOnKey } from '@shared/utils/activateOnKey';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({ icon, title, description, onClick }) => (
  <Surface
    variant="card"
    radius="lg"
    interactive
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={activateOnKey(onClick)}
    className="w-full p-4"
  >
    <div className="flex items-start gap-3">
      <Text as="div" tone="muted" className="mt-0.5 shrink-0">{icon}</Text>
      <div className="min-w-0 flex-1 space-y-1 text-left">
        <Text as="p" variant="bodyStrong">{title}</Text>
        <Text as="p" variant="helper" tone="muted">{description}</Text>
      </div>
    </div>
  </Surface>
);
