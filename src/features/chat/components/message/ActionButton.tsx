import React from 'react';
import { SURFACE, TEXT } from '@config/theme.config';

interface ActionButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}

/** Small icon button used in action bars */
const ActionButton: React.FC<ActionButtonProps> = ({ onClick, title, children, active }) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded transition-colors ${
      active
        ? 'text-green-500'
        : `${TEXT.faint} hover:text-parchment-800 dark:hover:text-night-300 ${SURFACE.hoverSubtle}`
    }`}
    title={title}
  >
    {children}
  </button>
);

export default ActionButton;
