/** Curated local models (speech-to-text, read-aloud voices, image generation, meeting search), each downloaded on demand. */

export const LOCAL_MODELS_CONFIG = {
  /** The provider every model on this device belongs to, in Providers and every picker. */
  provider: { id: 'on-device', title: 'On this device' },
  /** Providers › On this device copy. */
  page: {
    builtIn: 'Built in',
    systemVoices: 'Read aloud can speak with the voices the system ships.',
  },
  /** What each kind of model is for, in Settings › Providers › On this device. */
  kindLabels: { chat: 'Chat', speech: 'Speech recognition', voice: 'Read aloud voice', embedding: 'Meeting search' },
  /** Chat models' recommended sampling (their model cards), used unless a call sets its own. */
  chatSampling: { 'gemma-4-e2b': { temperature: 1.0, topP: 0.95, topK: 64 } },
  /** Rust → webview: one download's progress or outcome (`DownloadProgress`). */
  downloadEvent: 'models://download',
  /** Activity tray row id of a model's download. */
  activityId: (modelId: string) => `local-model:${modelId}`,
} as const;
