/** Curated local models (speech-to-text, read-aloud voices, image generation, meeting search), each downloaded on demand. */

export const LOCAL_MODELS_CONFIG = {
  /** The provider every model on this device belongs to, in Providers and every picker. */
  provider: { id: 'on-device', title: 'On this device' },
  /** Providers › On this device copy. */
  page: {
    builtIn: 'Built in',
    systemVoices: 'Read aloud can speak with the voices the system ships.',
    memory: 'Memory',
  },
  /** How long an unused model stays loaded (minutes; 0 = until Roci quits). Longer: no wait to reload; shorter: memory back sooner. */
  idle: {
    title: 'Free unused models after',
    footer: 'Models load when first used. Keeping them longer avoids the wait to load again; freeing them sooner returns memory.',
    defaultMinutes: 5,
    options: [
      { minutes: 1, label: '1 minute' },
      { minutes: 2, label: '2 minutes' },
      { minutes: 5, label: '5 minutes' },
      { minutes: 15, label: '15 minutes' },
      { minutes: 0, label: 'Never' },
    ],
  },
  /** What each kind of model is for, in Settings › Providers › On this device. */
  kindLabels: { chat: 'Chat', speech: 'Speech recognition', voice: 'Read aloud voice', embedding: 'Meeting search' },
  /** Chat models' recommended sampling with thinking off (their model cards), used unless a call sets its own. */
  chatSampling: {
    'qwen3.5-9b': { temperature: 0.7, topP: 0.8, topK: 20 },
    'ternary-bonsai-2-4b': { temperature: 0.7, topP: 0.8, topK: 20 },
  } as Partial<Record<string, { temperature: number; topP: number; topK?: number }>>,
  /** Rust → webview: one download's progress or outcome (`DownloadProgress`). */
  downloadEvent: 'models://download',
  /** Activity tray row id of a model's download. */
  activityId: (modelId: string) => `local-model:${modelId}`,
  /** Rust → webview: an on-device model started or ended loading (`ModelLoad`). */
  loadEvent: 'mlx://model',
} as const;
