/**
 * useCalendarControls — macOS Calendar row: access, on/off, notify lead time.
 * (App-lifetime polling and notifications live in useCalendarRuntime.)
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

export interface CalendarControls extends IntegrationControls {
  notifyMinutesBefore: number;
  setNotifyMinutesBefore: (minutes: number) => void;
}

export function useCalendarControls(): CalendarControls {
  const { settings, setSettings } = useSettings();
  const current = settings.calendarIntegration ?? {
    enabled: CALENDAR_DEFAULTS.enabled,
    notifyMinutesBefore: CALENDAR_DEFAULTS.notify_minutes_before,
  };
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
    notifyMinutesBefore: current.notifyMinutesBefore,
    setNotifyMinutesBefore: (minutes) => setSettings({ calendarIntegration: { ...current, notifyMinutesBefore: minutes } }),
  };
}
