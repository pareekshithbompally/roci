/**
 * PermissionAction — the one control for a macOS permission row:
 * ✓ Allowed · [Allow] (macOS can still prompt) · [Open Settings] (only the user can change it).
 * Used by the recording permission checklist and every integration row.
 */

import React from 'react';
import { Check } from 'lucide-react';
import { Button, Icon, Text } from '@shared/ui';
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
        <Text variant="helper" tone="success">Allowed</Text>
      </span>
    );
  }
  if (state === 'needs-request') {
    return <Button variant="primary" size="sm" onClick={onRequest}>Allow</Button>;
  }
  return <Button variant="outline" size="sm" onClick={onOpenSettings}>Open Settings</Button>;
};
