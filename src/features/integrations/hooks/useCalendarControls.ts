/** Calendar row (Mac and iPhone): access and on/off; watching and reminders live in useCalendarRuntime. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { calendarService } from '@services/calendar';
import { askNotificationsOnFirstUse } from '@services/notifications';
import { CALENDAR_DEFAULTS } from '@services/calendar/types';
import { useSystemAccess } from './useSystemAccess';
import type { IntegrationControls } from '@features/integrations/types';

const SOURCE = {
  id: 'calendar',
  check: () => calendarService.checkAccess(),
  request: () => calendarService.requestAccess(),
  settingsPane: 'calendars-settings',
} as const;

export function useCalendarControls(): IntegrationControls {
  const { settings, setSettings } = useSettings();
  const current = settings.calendarIntegration ?? { enabled: CALENDAR_DEFAULTS.enabled };
  const { access, requestAccess, openSettings } = useSystemAccess(SOURCE);

  const setEnabled = useCallback(async (on: boolean) => {
    // Turning on without access: ask while the system can still prompt; once denied, only Settings can change it.
    if (on && access === 'needs-settings') return openSettings();
    if (on && access === 'needs-request' && !(await requestAccess())) return;
    setSettings({ calendarIntegration: { ...current, enabled: on } });
    // Meeting reminders come with it: notifications are asked for here, at the user's own switch (asked once).
    if (on) await askNotificationsOnFirstUse();
  }, [access, current, openSettings, requestAccess, setSettings]);

  return {
    access,
    enabled: current.enabled,
    setEnabled: (on) => { setEnabled(on).catch((e: unknown) => console.error('[useCalendarControls] toggle failed:', e)); },
    request: () => { void requestAccess(); },
    openSettings,
  };
}
