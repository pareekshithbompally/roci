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

/** Fills the rest of its flex-column parent and centres itself both ways, Mac and iPhone alike: its icon in a soft circle,
 *  its title, then one line that wraps at a reading width (never across the whole screen). */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, message, description, action, className }) => (
  <div className={cn('flex w-full min-h-60 flex-1 flex-col items-center justify-center gap-3 px-6 text-center', className)}>
    <Surface variant="inset" radius="full" className="flex h-14 w-14 items-center justify-center">
      <Icon icon={icon} size="lg" tone="muted" />
    </Surface>
    <div className="flex max-w-xs flex-col items-center gap-1">
      <Text as="p" variant="headline">{message}</Text>
      {description && <Text as="p" variant="helper" tone="muted" className="text-balance">{description}</Text>}
    </div>
    {action}
  </div>
);
