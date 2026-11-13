/**
 * Calendar Notification Handler
 *
 * Two-layer notification flow:
 *
 *   Layer 1: OS-scheduled notification (actionTypeId: "calendar_event")
 *     → Fires at the correct time via macOS UNUserNotificationCenter.
 *     → When clicked, this handler shows an ACTIONABLE notification (Layer 2).
 *
 *   Layer 2: Actionable notification (actionTypeId: "meeting_starting" / "meeting_starting_no_url")
 *     → Shown via notifyWithActions → Rust mac-notification-sys.
 *     → Has Join & Record / Record / Snooze buttons.
 *     → When a button is clicked, dispatches to the provided callbacks.
 *
 * Event-based. No timers. No polling.
 */

import { notificationService } from '@services/tauri/notification.service';
import { calendarService } from './calendar.service';
import type { EnrichedCalendarEvent } from './types';

type RecordCallback = (event: EnrichedCalendarEvent) => void;
type JoinAndRecordCallback = (event: EnrichedCalendarEvent) => void;

interface CalendarNotificationHandlerOptions {
  onRecord: RecordCallback;
  onJoinAndRecord: JoinAndRecordCallback;
}

export function setupCalendarNotifications(
  options: CalendarNotificationHandlerOptions
): () => void {
  const { onRecord, onJoinAndRecord } = options;

  // Prevent showing the actionable notification twice for the same event
  const actionShown = new Set<string>();

  // ────────────── Layer 1: OS-scheduled notification click ──────────────

  const unsubOsClick = notificationService.onActionType(
    'calendar_event',
    (actionId: string, extra?: Record<string, unknown>) => {
      if (actionId === '__dismissed__') return;

      const eventId = extra?.event_id as string | undefined;
      if (!eventId) return;

      const event = calendarService.getEventById(eventId);
      if (!event) return;

      if (!actionShown.has(eventId)) {
        actionShown.add(eventId);
        showActionableNotification(event);
      }
    }
  );

  // ────────────── Layer 2: Actionable notification buttons ──────────────

  function handleMeetingAction(
    actionId: string,
    extra?: Record<string, unknown>
  ) {
    const eventId = extra?.event_id as string | undefined;
    if (!eventId) return;

    const event = calendarService.getEventById(eventId);
    if (!event) return;

    switch (actionId) {
      case 'join_and_record':
        onJoinAndRecord(event);
        actionShown.delete(eventId);
        break;
      case 'record_only':
        onRecord(event);
        actionShown.delete(eventId);
        break;
      case 'snooze':
        calendarService.snoozeEvent(event.event_id);
        actionShown.delete(eventId);
        break;
    }
  }

  const unsubWithUrl = notificationService.onActionType(
    'meeting_starting',
    handleMeetingAction
  );

  const unsubNoUrl = notificationService.onActionType(
    'meeting_starting_no_url',
    handleMeetingAction
  );

  return () => {
    unsubOsClick();
    unsubWithUrl();
    unsubNoUrl();
    actionShown.clear();
  };
}

async function showActionableNotification(event: EnrichedCalendarEvent): Promise<void> {
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
    console.error('[CalendarNotifications] Failed to show actionable notification:', error);
  }
}
