/** Public API for macOS Calendar via EventKit. */

export { calendarService } from './calendar.service';
export { configureMeetingReminders, onMeetingRecord } from './meeting-reminders';
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
