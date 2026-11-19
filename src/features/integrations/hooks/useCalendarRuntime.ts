/** Mount once inside Recording/Settings contexts: event cache watching, meeting reminders, record-from-reminder. */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useStartRecording } from '@features/recording';
import { useToast } from '@shared/contexts/ToastContext';
import {
  calendarService,
  configureMeetingReminders,
  onMeetingRecord,
  setPendingCalendarEvent,
  CALENDAR_DEFAULTS,
} from '@services/calendar';
import type { CalendarEvent } from '@services/calendar';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@config/notifications.config';
import { queryClient } from '@shared/query/queryClient';
import { useAppStore } from '@shared/stores/appStore';
import { queryKeys } from '@shared/query/queryKeys';

export function useCalendarRuntime(): void {
  const { settings } = useSettings();
  const startRecording = useStartRecording();
  const { showToast } = useToast();

  // Latest callbacks without re-subscribing the listeners every render.
  const startRecordingRef = useRef(startRecording);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    startRecordingRef.current = startRecording;
    showToastRef.current = showToast;
  });

  const enabled = platform.hasCalendar && isTauriEnvironment() && (settings.calendarIntegration?.enabled ?? CALENDAR_DEFAULTS.enabled);
  const notifications = settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
  const remindersOn = enabled && notifications.meetingReminders;
  const leadMinutes = notifications.meetingLeadMinutes;

  // Calendar UI cache
  useEffect(() => {
    if (!enabled) return;
    calendarService.startWatching();
    return () => calendarService.stopWatching();
  }, [enabled]);

  // Every week on screen or cached rereads when the calendar changes (native event, no polling)
  useEffect(() => {
    if (!enabled) return;
    return calendarService.onCalendarChanged(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendarEventsAll() });
    });
  }, [enabled]);

  // Native calendar reading follows the integration; reminders follow their own setting
  useEffect(() => {
    if (!platform.hasMeetingReminders) return;
    configureMeetingReminders(enabled, remindersOn, leadMinutes).catch((error: unknown) =>
      console.error('[useCalendarRuntime] Failed to configure meeting reminders:', error),
    );
  }, [enabled, remindersOn, leadMinutes]);

  // Record / Join & record from a reminder, the menu bar or the calendar (Rust already opened the call link for Join)
  useEffect(() => {
    if (!platform.hasMeetingReminders) return;
    const record = async (event: CalendarEvent) => {
      try {
        setPendingCalendarEvent(event);
        // Shown wherever it was started from: the recording view, not the page that was open.
        useAppStore.getState().setCurrentView('home');
        await startRecordingRef.current();
      } catch (error: unknown) {
        console.error('[useCalendarRuntime] Failed to start recording:', error);
        showToastRef.current('Failed to start recording', 'error');
      }
    };

    return onMeetingRecord((event) => void record(event));
  }, []);
}
