/** Public API for macOS Calendar via EventKit. */

export { calendarService } from './calendar.service';
export { configureMeetingReminders, onMeetingRecord, recordCalendarEvent } from './meeting-reminders';
export { setPendingCalendarEvent, consumePendingCalendarMeta } from './recording-bridge';
export type { CalendarRecordingMeta } from './recording-bridge';
export { occurrenceKey, findMeetingForOccurrence } from './occurrence';
export type {
  CalendarEvent,
  CalendarAttendee,
  CalendarAccessStatus,
  CalendarIntegrationSettings,
} from './types';
export { CALENDAR_DEFAULTS } from './types';
