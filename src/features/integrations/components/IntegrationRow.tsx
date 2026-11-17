/** One integration group: its switch row, the system access row while needed, then its settings; the footer says what it does. */

import React from 'react';
import { CardRow, Section, Switch } from '@shared/ui';
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
  // The switch shows on/off; the footer adds only what the switch can't say.
  const note = access === 'unavailable' ? unavailableReason : pending === 'needs-settings' ? deniedHint : undefined;

  return (
    <Section footer={note ? `${description} ${note}` : description}>
      <CardRow
        leading={icon}
        title={title}
        actions={
          <Switch
            checked={enabled}
            disabled={access === 'unknown' || access === 'unavailable'}
            onCheckedChange={setEnabled}
            aria-label={`Use ${title}`}
          />
        }
      />
      {pending && request && openSettings && (
        <CardRow
          title={`${platform.systemName} access`}
          actions={<PermissionAction state={pending} onRequest={request} onOpenSettings={openSettings} />}
        />
      )}
      {connected && children}
    </Section>
  );
};
