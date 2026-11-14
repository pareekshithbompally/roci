import React from 'react';
import { Circle, CircleDot } from 'lucide-react';
import { Icon, Surface, Text } from '@shared/ui';
import { activateOnKey } from './activateOnKey';

interface RadioCardProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  showDot?: boolean;
  className?: string;
}

export const RadioCard: React.FC<RadioCardProps> = ({
  selected,
  onClick,
  children,
  icon,
  showDot = false,
  className,
}) => (
  <Surface
    variant="card"
    radius="lg"
    interactive
    selected={selected}
    role="radio"
    aria-checked={selected}
    tabIndex={0}
    onClick={onClick}
    onKeyDown={activateOnKey(onClick)}
    className={`w-full text-left p-4 ${className ?? ''}`}
  >
    <div className="flex items-start gap-3">
      {showDot && (
        <Icon icon={selected ? CircleDot : Circle} size="md" tone={selected ? 'primary' : 'faint'} className="mt-0.5 shrink-0" />
      )}
      {icon && !showDot && (
        <Text as="div" tone={selected ? 'primary' : 'faint'} className="mt-0.5">
          {icon}
        </Text>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  </Surface>
);
