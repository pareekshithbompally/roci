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
  cacheRefreshIntervalMs: 5 * 60_000, // 5 minutes

  /** How often to check cached events for approaching notifications (ms) */
  notificationCheckIntervalMs: 60_000, // 1 minute

  /** Minutes past start time to still consider an event for notification (negative = already started) */
  notificationGracePeriodMinutes: -5,

  /** Snoozed events: re-notify within this many seconds of start */
  snoozeThresholdSeconds: 30,

  /** Default notify-before-meeting (minutes) */
  defaultNotifyMinutesBefore: 2,

  /** Whether calendar integration is enabled by default */
  defaultEnabled: false,

  /** Schedule-X week view day boundaries (covers typical IST working hours + evening) */
  weekView: {
    dayStartHour: '08:00',
    dayEndHour: '23:00',
  },
} as const;
