/** Application-wide configuration constants. */

export const APP_CONFIG = {
  name: 'Roci',
  /** The app icon (hull and thrust), shown on the welcome screen. */
  icon: '/favicon.svg',
  identifier: 'ai.roci.roci',
  /** Release notes for the latest version (the update row's Release notes action). */
  releasesUrl: 'https://github.com/pareekshithbompally/roci/releases/latest',

  /** Mac apps Roci shows the icon of (bundle ids). */
  macApps: {
    finder: 'com.apple.finder',
  },

  chat: {
    maxAttachmentSizeMB: 20,
    maxAttachmentSizeBytes: 20 * 1024 * 1024,
  },

  tray: {
    /** Meetings in the menu bar's Recent Meetings submenu. */
    recentMeetings: 3,
  },
} as const;

export const AVAILABLE_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
];
