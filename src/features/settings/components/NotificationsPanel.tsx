/** Settings › Notifications: the system permission and one switch per notification kind this device has. */

import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { MEETING_LEAD_OPTIONS, NOTIFICATION_KINDS } from '@config/notifications.config';
import { CardRow, Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { useNotificationControls } from '@features/notifications';
import type { NotificationControls } from '@features/notifications';
import { SettingsPage } from './shared';
import { platform } from '@platform/index';

const KINDS = NOTIFICATION_KINDS.filter(({ requires }) => !requires || platform[requires]);

const PermissionRow: React.FC<{ controls: NotificationControls }> = ({ controls }) => {
  const { access, request, openSettings } = controls;
  return (
    <CardRow
      title="Allow notifications"
      actions={access !== 'unknown' && access !== 'unavailable' && (
        <PermissionAction state={access} onRequest={request} onOpenSettings={openSettings} />
      )}
    />
  );
};

const LeadTimeSelect: React.FC<{ controls: NotificationControls }> = ({ controls }) => (
  <div className={LAYOUT.settingsSelect}>
    <Select
      value={String(controls.preferences.meetingLeadMinutes)}
      onValueChange={(value) => controls.setMeetingLeadMinutes(Number(value))}
      disabled={!controls.preferences.meetingReminders}
    >
      <SelectTrigger aria-label="Meeting reminder lead time">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MEETING_LEAD_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const NotificationsPanel: React.FC = () => {
  const controls = useNotificationControls();

  return (
    <SettingsPage title="Notifications" description="Choose what Roci tells you about.">
      <Section title={`${platform.systemName} notifications`} footer="Roci notifies you while it is in the background.">
        <PermissionRow controls={controls} />
      </Section>

      <Section title="Notify me about">
        {KINDS.map(({ kind, label }) => (
          <CardRow
            key={kind}
            title={label}
            actions={
              <>
                {kind === 'meetingReminders' && <LeadTimeSelect controls={controls} />}
                <Switch
                  size="sm"
                  checked={controls.preferences[kind]}
                  onCheckedChange={(on) => controls.setEnabled(kind, on)}
                  aria-label={label}
                />
              </>
            }
          />
        ))}
      </Section>
    </SettingsPage>
  );
};
