import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, Surface, Text, cn } from '@shared/ui';

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  /** Second line under the message */
  description?: string;
  /** Call to action (a kit Button) */
  action?: React.ReactNode;
  /** Spin the icon (loading states) */
  loading?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, message, description, action, loading, className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 w-full h-full min-h-60 text-center', className)}>
    <Surface variant="inset" radius="xl" className="flex items-center justify-center w-14 h-14">
      <Icon icon={icon} size="lg" tone="faint" className={loading ? 'animate-spin' : undefined} />
    </Surface>
    <div className="space-y-1">
      <Text as="p" tone="muted">{message}</Text>
      {description && <Text as="p" variant="helper" tone="faint">{description}</Text>}
    </div>
    {action}
  </div>
);
