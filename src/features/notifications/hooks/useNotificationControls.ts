/** Settings › Notifications: the macOS permission and the per-kind switches. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@config/notifications.config';
import { notificationStatus, requestNotifications } from '@services/notifications';
import { useSystemAccess } from '@features/integrations/hooks/useSystemAccess';
import type { CalendarAccessStatus } from '@services/calendar/types';
import type { IntegrationAccess } from '@features/integrations/types';
import type { NotificationKind, NotificationSettings } from '@shared/types';

const SOURCE = {
  id: 'notifications',
  /** `unsupported` (dev build, not a bundled .app) can't be granted here. */
  check: async (): Promise<CalendarAccessStatus | 'unavailable'> => {
    const status = await notificationStatus();
    return status === 'unsupported' ? 'unavailable' : status;
  },
  request: async () => (await requestNotifications()) === 'authorized',
  settingsPane: 'notifications-settings',
} as const;

export interface NotificationControls {
  access: IntegrationAccess;
  request: () => void;
  openSettings: () => void;
  preferences: NotificationSettings;
  setEnabled: (kind: NotificationKind, on: boolean) => void;
  setMeetingLeadMinutes: (minutes: number) => void;
}

export function useNotificationControls(): NotificationControls {
  const { settings, setSettings } = useSettings();
  const preferences = settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
  const { access, requestAccess, openSettings } = useSystemAccess(SOURCE);

  const update = useCallback(
    (patch: Partial<NotificationSettings>) => setSettings({ notifications: { ...preferences, ...patch } }),
    [preferences, setSettings],
  );

  return {
    access,
    request: () => { void requestAccess(); },
    openSettings,
    preferences,
    setEnabled: (kind, on) => update({ [kind]: on }),
    setMeetingLeadMinutes: (minutes) => update({ meetingLeadMinutes: minutes }),
  };
}
