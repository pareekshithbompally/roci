/**
 * Calendar Service
 *
 * Public API for macOS Calendar integration via EventKit.
 */

export { calendarService } from './calendar.service';
export { extractMeetingUrl } from './meeting-url';
export { setupCalendarNotifications } from './notification-handler';
export { setPendingCalendarEvent, consumePendingCalendarMeta, hasPendingCalendarEvent } from './recording-bridge';
export type { CalendarRecordingMeta } from './recording-bridge';
export type {
  CalendarEvent,
  CalendarAttendee,
  CalendarAccessStatus,
  EnrichedCalendarEvent,
  CalendarIntegrationSettings,
} from './types';
export { CALENDAR_DEFAULTS } from './types';
