/** The one control for a permission row: Allowed, [Allow] while macOS can prompt, else [Open Settings]. */

import React from 'react';
import { Check } from 'lucide-react';
import { Button, Icon, Text } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
import type { PermissionState } from '@services/permissions.service';

interface PermissionActionProps {
  state: PermissionState;
  onRequest: () => void;
  onOpenSettings: () => void;
}

export const PermissionAction: React.FC<PermissionActionProps> = ({ state, onRequest, onOpenSettings }) => {
  if (state === 'ready') {
    return (
      <span className="inline-flex items-center gap-1">
        <Icon icon={Check} size="sm" tone="success" />
        <Text variant="helper" tone="success">{KIT_COPY.permission.allowed}</Text>
      </span>
    );
  }
  if (state === 'needs-request') {
    return <Button variant="outline" size="sm" onClick={onRequest}>{KIT_COPY.permission.allow}</Button>;
  }
  return <Button variant="outline" size="sm" onClick={onOpenSettings}>{KIT_COPY.permission.openSettings}</Button>;
};
