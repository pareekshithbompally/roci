/** What stands where a kept item was removed (Keep or Delete All took it): an icon and a line, its parent stays. */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, Surface, Text } from '@shared/ui';

export const RemovedNotice: React.FC<{ icon: LucideIcon; label: string }> = ({ icon, label }) => (
  <Surface variant="subtle" radius="lg" className="inline-flex items-center gap-2 px-3 py-2">
    <Icon icon={icon} size="sm" tone="faint" />
    <Text variant="helper" tone="muted">{label}</Text>
  </Surface>
);
