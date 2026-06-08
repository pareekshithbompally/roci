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

  /** Minutes past start time to still consider an event for notification (negative = already started) */
  notificationGracePeriodMinutes: -5,

  /** Snoozed events: re-notify within this many seconds of start */
  snoozeThresholdSeconds: 30,

  /** Default notify-before-meeting (minutes) */
  defaultNotifyMinutesBefore: 2,

  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Schedule-X week view day boundaries */
  weekView: {
    dayStartHour: '00:00',
    dayEndHour: '24:00',
  },
} as const;
