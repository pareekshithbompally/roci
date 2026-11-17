/** One integration card: switch, macOS access row while needed, then its settings; rows show a status or action. */

import React from 'react';
import { Card, CardRow, Status, Switch } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import type { IntegrationControls } from '@features/integrations/types';
import { platform } from '@platform/index';

interface IntegrationRowProps extends IntegrationControls {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Shown when the user denied access, so they know where to change it. */
  deniedHint?: string;
  /** Settings rows (each with a status or an action), rendered only when connected. */
  children?: React.ReactNode;
}

export const IntegrationRow: React.FC<IntegrationRowProps> = ({
  icon, title, description, deniedHint, access, enabled, setEnabled, request, openSettings, unavailableReason, children,
}) => {
  const connected = enabled && access === 'ready';
  // The access the user still has to give, while the integration is on.
  const pending = enabled && (access === 'needs-request' || access === 'needs-settings') ? access : null;

  return (
    <Card>
      <CardRow
        leading={icon}
        title={title}
        description={description}
        status={connected && <Status tone="success">Connected</Status>}
        actions={
          <Switch
            size="sm"
            checked={enabled}
            disabled={access === 'unknown' || access === 'unavailable'}
            onCheckedChange={setEnabled}
            aria-label={`Use ${title}`}
          />
        }
      />
      {access === 'unavailable' && (
        <CardRow title="Not available" description={unavailableReason} />
      )}
      {pending && request && openSettings && (
        <CardRow
          title={`${platform.systemName} access`}
          description={pending === 'needs-settings' ? deniedHint : `${platform.systemName} asks once.`}
          actions={<PermissionAction state={pending} onRequest={request} onOpenSettings={openSettings} />}
        />
      )}
      {connected && children}
    </Card>
  );
};
