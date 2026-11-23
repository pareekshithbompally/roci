/** Settings › Notifications: the system permission and one switch per notification kind this device has. */

import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { MEETING_LEAD_COPY, MEETING_LEAD_OPTIONS, NOTIFICATION_KINDS } from '@config/notifications.config';
import { CardRow, Picker, Section, Switch } from '@shared/ui';
import { PermissionAction } from '@shared/components';
import { useNotificationControls } from '@features/notifications';
import type { NotificationControls } from '@features/notifications';
import { SettingsPage } from './shared';
import { platform } from '@platform/index';
import { NOTIFICATIONS_COPY as COPY } from '@config/settingsCopy.config';

const KINDS = NOTIFICATION_KINDS.filter(({ requires }) => !requires || platform[requires]);

const PermissionRow: React.FC<{ controls: NotificationControls }> = ({ controls }) => {
  const { access, request, openSettings } = controls;
  return (
    <CardRow
      title={COPY.allow}
      actions={access !== 'unknown' && access !== 'unavailable' && (
        <PermissionAction state={access} onRequest={request} onOpenSettings={openSettings} />
      )}
    />
  );
};

/** When a meeting reminder comes: its own row under the switch (one control per row), dimmed while reminders are off. */
const LeadTimeRow: React.FC<{ controls: NotificationControls }> = ({ controls }) => (
  <CardRow
    title={MEETING_LEAD_COPY.title}
    disabled={!controls.preferences.meetingReminders || controls.access === 'needs-settings'}
    actions={
      <div className={LAYOUT.settingsSelect}>
        <Picker
          label={MEETING_LEAD_COPY.label}
          value={String(controls.preferences.meetingLeadMinutes)}
          onChange={(value) => controls.setMeetingLeadMinutes(Number(value))}
          placeholder=""
          groups={[{ options: MEETING_LEAD_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })) }]}
        />
      </div>
    }
  />
);

export const NotificationsPanel: React.FC = () => {
  const controls = useNotificationControls();

  return (
    <SettingsPage pane="notifications">
      <Section title={COPY.system(platform.systemName)} footer={COPY.systemFooter}>
        <PermissionRow controls={controls} />
      </Section>

      <Section title={COPY.notifyAbout}>
        {KINDS.map(({ kind, label }) => (
          <React.Fragment key={kind}>
            <CardRow
              title={label}
              actions={
                <Switch
                  checked={controls.preferences[kind]}
                  disabled={controls.access === 'needs-settings'}
                  onCheckedChange={(on) => controls.setEnabled(kind, on)}
                  aria-label={label}
                />
              }
            />
            {kind === 'meetingReminders' && <LeadTimeRow controls={controls} />}
          </React.Fragment>
        ))}
      </Section>
    </SettingsPage>
  );
};
