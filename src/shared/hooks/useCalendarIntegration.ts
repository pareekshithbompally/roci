/**
 * useCalendarIntegration Hook
 *
 * Wires the calendar service to the app lifecycle:
 * - Starts/stops polling based on settings
 * - Sets up notification handlers (Record / Join & Record / Snooze)
 * - Bridges calendar events to the recording pipeline via recording-bridge
 *
 * Mount this hook once in a top-level component (e.g., App.tsx) that has access
 * to RecordingContext and SettingsContext.
 */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useRecordingContext } from '@features/recording';
import { useToast } from '@shared/contexts/ToastContext';
import {
  calendarService,
  setupCalendarNotifications,
  setPendingCalendarEvent,
  CALENDAR_DEFAULTS,
} from '@services/calendar';
import type { EnrichedCalendarEvent } from '@services/calendar';

export function useCalendarIntegration(): void {
  const { settings } = useSettings();
  const { startRecording } = useRecordingContext();
  const { showToast } = useToast();

  // Use refs to avoid re-subscribing on every render
  const startRecordingRef = useRef(startRecording);
  const showToastRef = useRef(showToast);
  startRecordingRef.current = startRecording;
  showToastRef.current = showToast;

  const calendarSettings = settings.calendarIntegration ?? {
    enabled: CALENDAR_DEFAULTS.enabled,
    notifyMinutesBefore: CALENDAR_DEFAULTS.notify_minutes_before,
  };

  useEffect(() => {
    if (!isTauriEnvironment() || !calendarSettings.enabled) {
      calendarService.stopPolling();
      return;
    }

    const handleRecord = async (event: EnrichedCalendarEvent) => {
      console.log('[DIAG:CalInteg] handleRecord called for event:', event.event_id, event.title);
      try {
        setPendingCalendarEvent(event);
        console.log('[DIAG:CalInteg] Calling startRecordingRef.current()...');
        await startRecordingRef.current();
        console.log('[DIAG:CalInteg] startRecording returned OK');
        showToastRef.current(`Recording started: ${event.title}`, 'success');
      } catch (error: unknown) {
        console.error('[DIAG:CalInteg] Failed to start recording:', error);
        showToastRef.current('Failed to start recording', 'error');
      }
    };

    const handleJoinAndRecord = async (event: EnrichedCalendarEvent) => {
      console.log('[DIAG:CalInteg] handleJoinAndRecord called for event:', event.event_id, event.title);
      // Open meeting URL in default browser
      if (event.meeting_url) {
        try {
          const { open } = await import('@tauri-apps/plugin-shell');
          console.log('[DIAG:CalInteg] Opening meeting URL:', event.meeting_url);
          await open(event.meeting_url);
        } catch (error: unknown) {
          console.error('[DIAG:CalInteg] Failed to open meeting URL:', error);
        }
      }
      // Start recording
      await handleRecord(event);
    };

    const unsubscribe = setupCalendarNotifications({
      onRecord: handleRecord,
      onJoinAndRecord: handleJoinAndRecord,
    });

    calendarService.updateSettings({
      enabled: calendarSettings.enabled,
      notify_minutes_before: calendarSettings.notifyMinutesBefore,
    });
    calendarService.startPolling();

    return () => {
      unsubscribe();
      calendarService.stopPolling();
    };
  }, [calendarSettings.enabled, calendarSettings.notifyMinutesBefore]);
}
