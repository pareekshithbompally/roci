import React from 'react';
import { cn } from './utils';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

/**
 * Canonical settings card (Jan Card/CardItem shape): an elevated container
 * holding title/description/action rows separated by dividers.
 */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(`${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`, className)}
      {...props}
    />
  );
}

export interface CardRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function CardRow({ title, description, actions, className, ...props }: CardRowProps) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4 px-4 py-3', className)}
      {...props}
    >
      <div className="min-w-0">
        <p className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>{title}</p>
        {description && (
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} mt-0.5`}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
