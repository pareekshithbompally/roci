import React from 'react';
import { SURFACE, BORDER, RADIUS, TEXT } from '@config/theme.config';

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
  <button
    role="radio"
    aria-checked={selected}
    onClick={onClick}
    className={`w-full text-left p-4 ${RADIUS.lg} border transition-all ${
      selected
        ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
        : `${SURFACE.card} ${BORDER.default} ${BORDER.cardHover}`
    } ${className ?? ''}`}
  >
    <div className="flex items-start gap-3">
      {showDot && (
        <div
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            selected
              ? `${BORDER.selectedCard}`
              : BORDER.strong
          }`}
        >
          {selected && (
            <div className={`w-2.5 h-2.5 rounded-full ${selected ? 'bg-paper-900 dark:bg-night-100' : ''}`} />
          )}
        </div>
      )}
      {icon && !showDot && (
        <div className={`mt-0.5 ${selected ? TEXT.heading : TEXT.faint}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  </button>
);
