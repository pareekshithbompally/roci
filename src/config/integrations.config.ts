/**
 * Integrations — the copy and options each integration row shows.
 * Behaviour lives in features/integrations; this is presentation data only.
 */

export const INTEGRATIONS_CONFIG = {
  calendar: {
    title: 'Calendar',
    description: 'Get notified before meetings and record them. Works with every account in macOS Calendar.',
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Calendars.',
    icon: '/images/macos-calendar-sm.png',
    notifyOptions: [
      { value: 1, label: '1 minute' },
      { value: 2, label: '2 minutes' },
      { value: 5, label: '5 minutes' },
      { value: 10, label: '10 minutes' },
    ],
  },
  appleIntelligence: {
    title: 'Apple Intelligence',
    description: 'Summaries and transcription on this Mac. Nothing leaves your Mac.',
    deniedHint: 'Apple Intelligence is off in System Settings › Apple Intelligence & Siri.',
    speechDeniedHint: 'Kasset is off in System Settings › Privacy & Security › Speech Recognition.',
    icon: '/images/apple-intelligence-sm.png',
    /** Why the model can't run (HEX `apple_intelligence::Availability::description`). */
    unavailable: {
      'device-not-eligible': 'This Mac doesn’t support Apple Intelligence.',
      'model-not-ready': 'The Apple Intelligence model is still downloading. Try again soon.',
      'unsupported-system': 'Requires macOS 26 or later.',
      unknown: 'Apple Intelligence is unavailable right now.',
    },
  },
  appleNotes: {
    title: 'Notes',
    description: 'Save each meeting’s summary and transcript as a note in Apple Notes.',
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Automation › Notes.',
    icon: '/images/macos-notes-sm.png',
    /** Folder in the default Notes account; created on first save. */
    folder: 'Kasset',
    /** Line at the end of each note that ties it to its meeting. */
    tagPrefix: 'Kasset meeting',
  },
  hex: {
    title: 'Hex',
    description: "Use Hex's transcription models, and bring every Hex meeting into Kasset.",
    icon: '/images/hex-app-sm.png',
    /** Catch-up on focus at most this often (a full read of Hex's meeting list). */
    focusSyncIntervalMs: 60_000,
  },
  reminders: {
    title: 'Reminders',
    description: 'Send meeting action items to Reminders. Completing one there completes it in Kasset.',
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Reminders.',
    icon: '/images/macos-reminders-sm.png',
    /** List created on first enable */
    defaultListTitle: 'Kasset',
    /** Reminders fires several change notifications per edit; pull once they settle. */
    pullDebounceMs: 500,
  },
} as const;
