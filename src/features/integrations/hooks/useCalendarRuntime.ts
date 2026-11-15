/** Mount once inside Recording/Settings contexts: event cache polling, meeting reminders, record-from-reminder. */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useRecordingContext } from '@features/recording';
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

export function useCalendarRuntime(): void {
  const { settings } = useSettings();
  const { startRecording } = useRecordingContext();
  const { showToast } = useToast();

  // Latest callbacks without re-subscribing the listeners every render.
  const startRecordingRef = useRef(startRecording);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    startRecordingRef.current = startRecording;
    showToastRef.current = showToast;
  });

  const enabled = isTauriEnvironment() && (settings.calendarIntegration?.enabled ?? CALENDAR_DEFAULTS.enabled);
  const notifications = settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
  const remindersOn = enabled && notifications.meetingReminders;
  const leadMinutes = notifications.meetingLeadMinutes;

  // Calendar UI cache
  useEffect(() => {
    if (!enabled) return;
    calendarService.startPolling();
    return () => calendarService.stopPolling();
  }, [enabled]);

  // Native reminders follow the setting
  useEffect(() => {
    configureMeetingReminders(remindersOn, leadMinutes).catch((error: unknown) =>
      console.error('[useCalendarRuntime] Failed to configure meeting reminders:', error),
    );
  }, [remindersOn, leadMinutes]);

  // Record / Join & record (Rust already opened the call link for Join)
  useEffect(() => {
    const record = async (event: CalendarEvent) => {
      try {
        setPendingCalendarEvent(event);
        await startRecordingRef.current();
      } catch (error: unknown) {
        console.error('[useCalendarRuntime] Failed to start recording:', error);
        showToastRef.current('Failed to start recording', 'error');
      }
    };

    return onMeetingRecord((event) => void record(event));
  }, []);
}
