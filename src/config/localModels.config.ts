/**
 * Local models — the curated models Kasset downloads and runs on this Mac
 * (src-tauri/src/models): speech-to-text (transcribe.cpp) and read-aloud
 * voices (Phonon). Nothing is bundled; each downloads on demand.
 */

export const LOCAL_MODELS_CONFIG = {
  /** The picker group local models run under (speech and voice). */
  provider: { id: 'on-device', title: 'On this Mac' },
  /** What each kind of model is for, in Settings › Capabilities › On this Mac. */
  kindLabels: { speech: 'Speech recognition', voice: 'Read aloud voice' },
  /** Rust → webview: one download's progress or outcome (`DownloadProgress`). */
  downloadEvent: 'models://download',
  /** Activity tray row id of a model's download. */
  activityId: (modelId: string) => `local-model:${modelId}`,
} as const;
