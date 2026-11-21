/** Application-wide configuration constants. */

/** Roci's source on GitHub. */
const REPOSITORY_URL = 'https://github.com/pareekshithbompally/roci';

export const APP_CONFIG = {
  name: 'Roci',
  /** The app icon (hull and thrust), shown on the welcome screen. */
  icon: '/favicon.svg',
  identifier: 'ai.roci.roci',
  /** As the app bundle states it (tauri.conf.json `bundle.copyright`). */
  copyright: 'Copyright © 2026 Pareekshith Bompally',
  /** Roci on GitHub (Settings › About). */
  repositoryUrl: REPOSITORY_URL,
  /** Release notes for the latest version (the update row's Release notes action). */
  releasesUrl: `${REPOSITORY_URL}/releases/latest`,

  /** iOS: Roci's own page in Settings (`UIApplication.openSettingsURLString`), where a denied permission is turned back on. */
  iosAppSettingsUrl: 'app-settings:',

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
