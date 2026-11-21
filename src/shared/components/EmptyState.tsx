import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, Surface, Text, cn } from '@shared/ui';

export interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  /** Second line under the message */
  description?: string;
  /** Call to action (a kit Button) */
  action?: React.ReactNode;
  className?: string;
}

/** Fills the rest of its flex-column parent and centres itself both ways: one position wherever it's used. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, message, description, action, className }) => (
  <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 w-full min-h-60 text-center', className)}>
    <Surface variant="inset" radius="xl" className="flex items-center justify-center w-14 h-14">
      <Icon icon={icon} size="lg" tone="faint" />
    </Surface>
    <div className="space-y-1">
      <Text as="p" tone="muted">{message}</Text>
      {description && <Text as="p" variant="helper" tone="faint">{description}</Text>}
    </div>
    {action}
  </div>
);
