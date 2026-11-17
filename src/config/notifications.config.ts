/** Notification kinds, copy and defaults, plus the native bridge's event names and buttons. */

import type { NotificationKind, NotificationSettings } from '@shared/types';
import { platform, type PlatformCapability } from '@platform/index';

/** `requires`: the capability the kind depends on; devices without it don't list the kind. */
export const NOTIFICATION_KINDS: ReadonlyArray<{ kind: NotificationKind; label: string; description: string; requires?: PlatformCapability }> = [
  { kind: 'meetingReminders', label: 'Meeting reminders', description: 'Before a calendar meeting, with Record.', requires: 'hasCalendar' },
  { kind: 'detectedCalls', label: 'Detected calls', description: 'When a call app starts using the microphone.', requires: 'hasCallDetection' },
  { kind: 'recordingReady', label: 'Recording ready', description: 'When a recording is summarized, or fails.' },
  { kind: 'hexImports', label: 'Hex meetings imported', description: 'When new meetings arrive from Hex.', requires: 'hasHex' },
  { kind: 'modelDownloads', label: 'Model downloads', description: 'When an on-device model finishes downloading.', requires: 'hasOnDeviceModels' },
  { kind: 'chatReplies', label: 'Chat replies', description: 'When a reply finishes in the background.' },
  { kind: 'todoReminders', label: 'To-do reminders', description: 'At the time you set on a to-do.' },
];

/** Settings › Notifications › Allow failing, shown as an error toast with the system's reason after it. */
export const NOTIFICATION_PERMISSION_COPY = {
  requestFailed: `${platform.systemName} didn’t ask for notification access`,
} as const;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  meetingReminders: true,
  detectedCalls: true,
  recordingReady: true,
  hexImports: true,
  modelDownloads: true,
  chatReplies: true,
  todoReminders: true,
  meetingLeadMinutes: 2,
};

/** Lead times offered for meeting reminders. */
export const MEETING_LEAD_OPTIONS = [
  { value: 1, label: '1 min before' },
  { value: 2, label: '2 min before' },
  { value: 5, label: '5 min before' },
  { value: 10, label: '10 min before' },
] as const;

export const NOTIFICATIONS_CONFIG = {
  /** Rust → webview (tauri-plugin-notifications). */
  events: {
    /** The user answered a notification. */
    response: 'notifications://response',
  },

  todo: {
    idPrefix: 'todo:',
    category: 'todo_reminder',
    actions: { viewMeeting: 'view_meeting', snooze: 'snooze_15', dismiss: 'dismiss' },
    snoozeMinutes: 15,
    /** Longest to-do text shown in a notification. */
    bodyMaxChars: 80,
  },

  chat: {
    /** Longest reply excerpt shown in a "Reply ready" notification. */
    bodyMaxChars: 120,
  },

  recording: {
    idPrefix: 'recording:',
    category: 'recording_timeout',
    actions: { keep: 'keep_recording', stop: 'stop_now' },
    /** Ask "Still recording?" each time a recording crosses this many seconds. */
    askEverySeconds: 60 * 60,
    /** Stop this long after asking, unless the user keeps recording. */
    autoStopAfterSeconds: 5 * 60,
  },
} as const;

/** Button sets registered with macOS (and shown on in-app fallbacks). */
export const NOTIFICATION_CATEGORIES = [
  {
    id: NOTIFICATIONS_CONFIG.todo.category,
    actions: [
      { id: NOTIFICATIONS_CONFIG.todo.actions.viewMeeting, title: 'View meeting' },
      { id: NOTIFICATIONS_CONFIG.todo.actions.snooze, title: 'Snooze 15 min' },
      { id: NOTIFICATIONS_CONFIG.todo.actions.dismiss, title: 'Dismiss' },
    ],
  },
  {
    id: NOTIFICATIONS_CONFIG.recording.category,
    actions: [
      { id: NOTIFICATIONS_CONFIG.recording.actions.keep, title: 'Keep recording' },
      { id: NOTIFICATIONS_CONFIG.recording.actions.stop, title: 'Stop now' },
    ],
  },
];
