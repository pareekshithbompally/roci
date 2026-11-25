/** Curated local models (speech-to-text, read-aloud voices, image generation, meeting search), each downloaded on demand. */

import type { ModelTuning } from '@config/personalization.config';

export const LOCAL_MODELS_CONFIG = {
  /** The provider every model on this device belongs to, in Providers and every picker. */
  provider: { id: 'on-device', title: 'On this device' },
  /** Providers › On this device copy. */
  page: {
    builtIn: 'Built in',
    systemVoices: 'Read aloud can speak with the voices the system ships.',
    memory: 'Memory',
  },
  /** Where downloaded models are stored (Mac): Roci's own folder, or one the user picks, e.g. a Hugging Face cache shared
   *  with other apps. Only the files Roci lists count there; nothing else in the folder is used. */
  directory: {
    title: 'Model directory',
    rociFolder: 'Roci’s folder',
    choose: 'Choose…',
    reset: 'Use Roci’s Folder',
    pickerTitle: 'Choose a model directory',
    footer: 'Where downloaded models are stored. Choose a Hugging Face cache (~/.cache/huggingface/hub) to share models with other apps; Roci uses only the model files it lists there.',
    refused: 'Roci can’t use that folder. Check that it exists and that Roci may read and write it.',
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
  kindLabels: { chat: 'Chat', speech: 'Transcription', voice: 'Speech', embedding: 'Search' },
  /** The Mac's engine (llama.cpp's server), Settings › Providers › On this device: what it keeps free, how much of earlier
   *  prompts each model keeps, and how many models it holds at once. Defaults are Llama.app's, but the prompt cache:
   *  llama.cpp's own 8 GB per model process is more than a base Mac has to spare, while 1 GB holds several chats' worth
   *  of a small model's context. */
  engine: {
    defaults: { memoryMarginMib: 1024, cacheRamMib: 1024, modelsMax: 0 },
    memoryMargin: {
      title: 'Memory to Keep Free',
      options: [
        { mib: 512, label: '512 MB' },
        { mib: 1024, label: '1 GB' },
        { mib: 2048, label: '2 GB' },
        { mib: 4096, label: '4 GB' },
      ],
    },
    cacheRam: {
      title: 'Prompt Cache',
      options: [
        { mib: 0, label: 'Off' },
        { mib: 512, label: '512 MB per model' },
        { mib: 1024, label: '1 GB per model' },
        { mib: 2048, label: '2 GB per model' },
        { mib: 4096, label: '4 GB per model' },
        { mib: 8192, label: '8 GB per model' },
      ],
    },
    modelsMax: {
      title: 'Models at Once',
      options: [
        { count: 1, label: 'One' },
        { count: 2, label: 'Two' },
        { count: 3, label: 'Three' },
        { count: 0, label: 'As Many as Fit' },
      ],
    },
    /** The Restart row: shown where engine or model settings change, live once a restart would apply them. */
    restart: {
      title: 'On-Device Engine',
      help: 'These settings are written into the engine’s setup, so they apply after it restarts. Restarting frees every loaded model; each loads again the next time it’s used.',
      pending: 'Restart to apply',
      action: 'Restart',
    },
    footer: 'Roci keeps this much memory free for other apps, unloading the model used longest ago when a new one needs room. The prompt cache keeps recent chats ready, so going back to one doesn’t mean reading it again.',
  },
  /** Each chat model's maker's settings (its model card), in llama-server's option names, as its preset takes them. */
  makerDefaults: {
    'gemma-4-e4b': { temp: 1, 'top-p': 0.95, 'top-k': 64, 'min-p': 0, 'presence-penalty': 0, 'repeat-penalty': 1 },
    'gemma-4-e2b': { temp: 1, 'top-p': 0.95, 'top-k': 64, 'min-p': 0, 'presence-penalty': 0, 'repeat-penalty': 1 },
    'nemotron-3.5-bolt-e4b': { temp: 1, 'top-p': 0.95, 'top-k': 64, 'min-p': 0, 'presence-penalty': 0, 'repeat-penalty': 1 },
    'lfm3-omni-2b': { temp: 0.3, 'top-p': 1, 'top-k': 0, 'min-p': 0.15, 'presence-penalty': 0, 'repeat-penalty': 1.05, 'dry-multiplier': 0.8 },
  } as Partial<Record<string, ModelTuning>>,
  /** Every chat model's settings where its maker states none: 16k tokens of context (Roci's chat with its tools needs
   *  about 5k before any history), and Llama.app's reply and thinking limits. */
  rociDefaults: { 'ctx-size': 16384, 'n-predict': 8192, 'reasoning-budget': 1024 } satisfies ModelTuning,
  /** Rust → webview: one download's progress or outcome (`DownloadProgress`). */
  downloadEvent: 'models://download',
  /** Activity tray row id of a model's download. */
  activityId: (modelId: string) => `local-model:${modelId}`,
  /** Rust → webview: an on-device model started or ended loading (`ModelLoad`). */
  loadEvent: 'local://model',
} as const;
