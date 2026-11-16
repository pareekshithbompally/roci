/** Application-wide configuration constants. */

export const APP_CONFIG = {
  name: 'Roci',
  version: '1.0.0',
  identifier: 'ai.roci.app',
  /** Release notes for the latest version (the update row's Release notes action). */
  releasesUrl: 'https://github.com/pareekshithbompally/kasset-ai/releases/latest',

  /** Mac apps Roci shows the icon of (bundle ids). */
  macApps: {
    finder: 'com.apple.finder',
  },
  
  window: {
    title: 'Roci',
    minWidth: 800,
    minHeight: 600,
    defaultWidth: 1200,
    defaultHeight: 800,
  },
  
  recording: {
    defaultFormat: 'webm',
    supportedFormats: ['webm', 'mp3', 'wav', 'ogg'] as const,
    maxDuration: 3600, // 1 hour in seconds
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
  
  files: {
    defaultSaveLocation: 'recordings',
    allowedExtensions: {
      audio: ['webm', 'mp3', 'wav', 'ogg'],
      transcript: ['txt', 'md', 'json'],
    },
  },

  chat: {
    maxAttachmentSizeMB: 20,
    maxAttachmentSizeBytes: 20 * 1024 * 1024,
  },
  
  tray: {
    tooltip: 'Roci',
    /** Meetings in the menu bar's Recent Meetings submenu. */
    recentMeetings: 3,
  },
} as const;

export type RecordingFormat = typeof APP_CONFIG.recording.supportedFormats[number];

export const AVAILABLE_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
];
