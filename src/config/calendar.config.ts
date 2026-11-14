/**
 * Calendar Integration Configuration
 *
 * All polling intervals, cache windows, notification thresholds,
 * and UI constants for the calendar integration in one place.
 */

export const CALENDAR_CONFIG = {
  /** How far ahead to fetch events for the lookahead cache (days) */
  lookaheadDays: 7,

  /** How often to refresh the full event cache from EventKit (ms) */
  cacheRefreshIntervalMs: 2 * 60_000, // 2 minutes

  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Rust → webview (src-tauri/src/meeting_reminders): Record or Join & record was chosen. */
  reminderRecordEvent: 'meeting-reminders://record',

  /** Schedule-X week view day boundaries */
  weekView: {
    dayStartHour: '00:00',
    dayEndHour: '24:00',
  },
} as const;
