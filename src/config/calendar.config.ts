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

  /** The place's one name: sidebar row and page title. */
  title: 'Upcoming',

  /** Schedule-X time grid: day boundaries, grid height and event width (%), the same for the week (Mac) and day (iPhone) views. */
  weekView: {
    dayStartHour: '00:00',
    dayEndHour: '24:00',
    /** One hour's height in px: room for a title and a time line in a half-hour event. */
    hourHeight: 64,
    /** Hours the grid spans (dayStartHour to dayEndHour). */
    hours: 24,
    /** Share of the day column an event fills (%), leaving a gap beside it. */
    eventWidth: 92,
    /** Events at the same time sit side by side instead of on top of each other. */
    eventOverlap: false,
  },
} as const;
