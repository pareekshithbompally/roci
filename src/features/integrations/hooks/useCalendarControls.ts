/**
 * useCalendarControls — macOS Calendar row: access and on/off.
 * (Polling and meeting reminders live in useCalendarRuntime; the reminder
 * switch and lead time are in Settings › Notifications.)
 */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { calendarService } from '@services/calendar';
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
    // Turning on without access: ask while macOS can still prompt; once denied, only Settings can change it.
    if (on && access === 'needs-settings') return openSettings();
    if (on && access === 'needs-request' && !(await requestAccess())) return;
    setSettings({ calendarIntegration: { ...current, enabled: on } });
  }, [access, current, openSettings, requestAccess, setSettings]);

  return {
    access,
    enabled: current.enabled,
    setEnabled: (on) => { setEnabled(on).catch((e: unknown) => console.error('[useCalendarControls] toggle failed:', e)); },
    request: () => { requestAccess().catch((e: unknown) => console.error('[useCalendarControls] request failed:', e)); },
    openSettings,
  };
}
