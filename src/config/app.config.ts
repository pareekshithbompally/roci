/**
 * Application-wide configuration constants
 * Centralized configuration to avoid hardcoding values throughout the codebase
 */

export const APP_CONFIG = {
  name: 'Kasset.ai',
  version: '1.0.0',
  identifier: 'ai.kasset.desktop',
  
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
  
  tray: {
    tooltip: 'Kasset.ai',
  },
} as const;

export type RecordingFormat = typeof APP_CONFIG.recording.supportedFormats[number];
