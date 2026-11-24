/** Calendar integration: native events, record labels and the Upcoming grid. */

import { platform } from '@platform/index';

export const CALENDAR_CONFIG = {
  /** A meeting recorded from an occurrence is made within this long of its start (either side), in ms. */
  occurrenceWindowMs: 24 * 60 * 60 * 1000,
  /** Meetings looked at for one occurrence (re-recordings of it); the newest matching one is its meeting. */
  meetingsPerOccurrence: 10,
  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Rust → webview (tauri-plugin-calendar): upcoming events may differ (calendar change, new day, clock change, wake). */
  changedEvent: 'calendar://changed',

  /** Rust → webview (src-tauri/src/meeting_reminders): Record or Join & record was chosen. */
  reminderRecordEvent: 'meeting-reminders://record',

  /** The popover's record actions; the same words as the reminders and the menu bar. */
  recordLabels: { join: 'Join & Record', record: 'Record' },
  /** The event detail's rows (iPhone): the call's command, who's invited, which calendar. */
  joinLabel: 'Join',
  openMeetingLabel: 'Open meeting',
  noCallLink: 'No call link',
  unknownPerson: 'Unknown',
  recordFailed: "Couldn't start recording",
  inviteesLabel: 'Invitees',
  calendarLabel: 'Calendar',
  /** Upcoming when it has no events to show: the integration off, access refused, or the read failed. */
  states: {
    off: { message: 'Calendar integration is not enabled', description: 'Enable calendar integration in Settings to see your upcoming events.' },
    noAccess: { message: 'Calendar access is off', description: 'Allow Roci to read your calendars to see your events here.' },
    readFailed: {
      message: 'Couldn’t read your calendar',
      description: `${platform.systemName} did not return your events. Try again, or check Calendar access in ${platform.settingsAppName}.`,
    },
  },

  /** All-day events: the grid's row label and the popover's time line. */
  allDayLabel: 'all-day',

  /** The place's one name: sidebar row and page title. */
  title: 'Upcoming',
  /** Back to today, once you've moved away from it. */
  today: 'Today',

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
