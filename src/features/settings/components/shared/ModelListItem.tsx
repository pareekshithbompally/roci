import React from 'react';
import { Trash2 } from 'lucide-react';
import { SURFACE, BORDER, COMPONENT, RADIUS, SPACING, TEXT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface ModelListItemProps {
  name: string;
  subtitle?: string;
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  rightSlot?: React.ReactNode;
}

export const ModelListItem: React.FC<ModelListItemProps> = ({
  name,
  subtitle,
  selected,
  onClick,
  onDelete,
  deleteDisabled,
  rightSlot,
}) => (
  <div
    className={`flex items-center justify-between ${SPACING.card} ${RADIUS.md} border transition-colors ${
      selected
        ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
        : `${SURFACE.card} ${BORDER.default}`
    }`}
  >
    <div
      className={`flex-1 min-w-0 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className={`${TYPOGRAPHY_CLASSES.settingsInput} font-medium ${TEXT.heading} truncate`}>
        {name}
      </div>
      {subtitle && (
        <div className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
          {subtitle}
        </div>
      )}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {rightSlot}
      {onDelete && (
        <button
          onClick={onDelete}
          disabled={deleteDisabled}
          className={`p-1.5 rounded-md ${COMPONENT.destructiveHover} transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
);
