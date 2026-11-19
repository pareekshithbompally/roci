/** Calendar integration: native events, record labels and the Upcoming grid. */

export const CALENDAR_CONFIG = {
  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Rust → webview (tauri-plugin-calendar): upcoming events may differ (calendar change, new day, clock change, wake). */
  changedEvent: 'calendar://changed',

  /** Rust → webview (src-tauri/src/meeting_reminders): Record or Join & record was chosen. */
  reminderRecordEvent: 'meeting-reminders://record',

  /** The popover's record actions; the same words as the reminders and the menu bar. */
  recordLabels: { join: 'Join & Record', record: 'Record' },

  /** All-day events: the grid's row label and the popover's time line. */
  allDayLabel: 'all-day',

  /** The place's one name: sidebar row and page title. */
  title: 'Upcoming',

  /** The Upcoming time grid: an hour's height (px), the shortest block (min), the gap between side-by-side blocks (px),
   *  and how many hours above now it opens scrolled to. */
  grid: {
    hourHeight: 56,
    minBlockMinutes: 15,
    laneGapPx: 2,
    scrollLeadHours: 1,
    /** An hour label this close to the now pill (px, centre to centre) gives way to it. */
    nowLabelClearancePx: 18,
  },
} as const;
