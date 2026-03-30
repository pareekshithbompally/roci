/**
 * Calendar Notification Handler
 *
 * Connects the calendar service to the notification service.
 * When the calendar service detects an approaching meeting, this handler
 * fires an OS notification with appropriate actions (Join & Record / Record / Snooze).
 */

import { notificationService } from '../tauri/notification.service';
import { calendarService } from './calendar.service';
import type { EnrichedCalendarEvent } from './types';

/** Callback when user chooses to record (with or without joining). */
type RecordCallback = (event: EnrichedCalendarEvent) => void;

/** Callback when user chooses to join + record. Opens meeting URL. */
type JoinAndRecordCallback = (event: EnrichedCalendarEvent) => void;

interface CalendarNotificationHandlerOptions {
  onRecord: RecordCallback;
  onJoinAndRecord: JoinAndRecordCallback;
}

/**
 * Wire up calendar service → notifications → action handlers.
 * Returns an unsubscribe function to clean up all listeners.
 */
export function setupCalendarNotifications(
  options: CalendarNotificationHandlerOptions
): () => void {
  const { onRecord, onJoinAndRecord } = options;

  // Store pending events by notification ID for action handler lookup
  const pendingEvents = new Map<string, EnrichedCalendarEvent>();

  // When calendar service detects an approaching meeting, fire notification
  const unsubMeeting = calendarService.onMeetingStarting((event) => {
    console.log('[DIAG:NotifHandler] Meeting starting event received:', event.event_id, event.title);
    pendingEvents.set(event.event_id, event);
    fireNotification(event);
  });

  // Handle actions for meetings WITH a video URL
  const unsubWithUrl = notificationService.onActionType(
    'meeting_starting',
    (actionId: string, extra?: Record<string, unknown>) => {
      console.log('[DIAG:NotifHandler] Action received (with_url): actionId=%s, extra=%o', actionId, extra);
      const eventId = extra?.event_id as string | undefined;
      const event = eventId ? pendingEvents.get(eventId) : undefined;
      if (!event) {
        console.warn('[DIAG:NotifHandler] No pending event found for eventId:', eventId);
        return;
      }

      switch (actionId) {
        case 'join_and_record':
          console.log('[DIAG:NotifHandler] Dispatching join_and_record');
          onJoinAndRecord(event);
          pendingEvents.delete(event.event_id);
          break;
        case 'record_only':
          console.log('[DIAG:NotifHandler] Dispatching record_only');
          onRecord(event);
          pendingEvents.delete(event.event_id);
          break;
        case 'snooze':
          console.log('[DIAG:NotifHandler] Dispatching snooze');
          calendarService.snoozeEvent(event.event_id);
          pendingEvents.delete(event.event_id);
          break;
      }
    }
  );

  // Handle actions for meetings WITHOUT a video URL
  const unsubNoUrl = notificationService.onActionType(
    'meeting_starting_no_url',
    (actionId: string, extra?: Record<string, unknown>) => {
      console.log('[DIAG:NotifHandler] Action received (no_url): actionId=%s, extra=%o', actionId, extra);
      const eventId = extra?.event_id as string | undefined;
      const event = eventId ? pendingEvents.get(eventId) : undefined;
      if (!event) {
        console.warn('[DIAG:NotifHandler] No pending event found for eventId:', eventId);
        return;
      }

      switch (actionId) {
        case 'record_only':
          console.log('[DIAG:NotifHandler] Dispatching record_only (no_url)');
          onRecord(event);
          pendingEvents.delete(event.event_id);
          break;
        case 'snooze':
          console.log('[DIAG:NotifHandler] Dispatching snooze (no_url)');
          calendarService.snoozeEvent(event.event_id);
          pendingEvents.delete(event.event_id);
          break;
      }
    }
  );

  return () => {
    unsubMeeting();
    unsubWithUrl();
    unsubNoUrl();
    pendingEvents.clear();
  };
}

/** Fire a notification for an approaching meeting. */
async function fireNotification(event: EnrichedCalendarEvent): Promise<void> {
  const startTime = new Date(event.start_date);
  const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const participantInfo = event.active_participant_count > 0
    ? ` with ${event.active_participant_count} participant${event.active_participant_count === 1 ? '' : 's'}`
    : '';

  const body = `"${event.title}" at ${timeStr}${participantInfo}`;
  const actionTypeId = event.meeting_url ? 'meeting_starting' : 'meeting_starting_no_url';

  try {
    await notificationService.notifyWithActions({
      title: 'Meeting Starting Soon',
      body,
      actionTypeId,
      extra: {
        event_id: event.event_id,
        meeting_url: event.meeting_url ?? '',
      },
    });
  } catch (error: unknown) {
    console.error('[CalendarNotifications] Failed to send notification:', error);
  }
}
