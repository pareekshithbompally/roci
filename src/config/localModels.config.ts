/** Curated local models (speech-to-text and read-aloud voices), each downloaded on demand. */

export const LOCAL_MODELS_CONFIG = {
  /** The picker group local models run under (speech and voice). */
  provider: { id: 'on-device', title: 'On this Mac' },
  /** What each kind of model is for, in Settings › Capabilities › On this Mac. */
  kindLabels: { speech: 'Speech recognition (STT)', voice: 'Read aloud voice (TTS)' },
  /** Rust → webview: one download's progress or outcome (`DownloadProgress`). */
  downloadEvent: 'models://download',
  /** Activity tray row id of a model's download. */
  activityId: (modelId: string) => `local-model:${modelId}`,
} as const;
