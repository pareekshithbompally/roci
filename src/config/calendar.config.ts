/** Calendar integration cache window, native events and UI constants. */

export const CALENDAR_CONFIG = {
  /** How far ahead to fetch events for the lookahead cache (days) */
  lookaheadDays: 7,

  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Rust → webview (tauri-plugin-calendar): upcoming events may differ (calendar change, new day, clock change, wake). */
  changedEvent: 'calendar://changed',

  /** Rust → webview (src-tauri/src/meeting_reminders): Record or Join & record was chosen. */
  reminderRecordEvent: 'meeting-reminders://record',

  /** Schedule-X week view day boundaries */
  weekView: {
    dayStartHour: '00:00',
    dayEndHour: '24:00',
  },
} as const;
