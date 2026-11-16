/** Application-wide configuration constants. */

export const APP_CONFIG = {
  name: 'Kasset.ai',
  version: '1.0.0',
  identifier: 'ai.kasset.desktop',

  /** Mac apps Kasset shows the icon of (bundle ids). */
  macApps: {
    finder: 'com.apple.finder',
  },
  
  window: {
    title: 'Kasset.ai',
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
    tooltip: 'Kasset.ai',
  },
} as const;

export type RecordingFormat = typeof APP_CONFIG.recording.supportedFormats[number];

export const AVAILABLE_MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash' },
];
