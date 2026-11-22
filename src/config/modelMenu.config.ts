/** Every model menu's words (chat and Settings): the grey line under a model, and the section for models that need a step first. */

export const MODEL_MENU_COPY = {
  needsSetup: 'Needs setup',
  /** What a model takes in and can do. */
  facts: { vision: 'Vision', audio: 'Audio', video: 'Video', pdf: 'PDF', tools: 'Tools', thinking: 'Thinking', loaded: 'Loaded' },
  /** Each feature by name, as its chip and its ⋯ menu correction say it. */
  features: { vision: 'Vision', audio: 'Audio input', video: 'Video input', pdf: 'PDF input', tools: 'Tool calling', thinking: 'Thinking' },
  /** The step a model needs, or where it stands. */
  setup: {
    download: 'Download',
    downloading: (percent: number | null) => (percent === null ? 'Downloading…' : `Downloading ${percent}%`),
    allow: 'Allow access',
  },
  /** A text-only menu (iPhone) puts the grey line after the name. */
  textSeparator: ' — ',
} as const;
