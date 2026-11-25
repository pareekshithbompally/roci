/** Settings › Default Models copy: which model does each job; pickers list models from Providers. */

export const DEFAULT_MODELS_CONFIG = {
  jobs: {
    chat: { title: 'Chat' },
    transcription: { title: 'Transcription' },
    summaries: { title: 'Summaries' },
    meetingSearch: { title: 'Search' },
    readAloud: { title: 'Speech' },
    images: { title: 'Image generation' },
    voice: { title: 'Voice' },
  },
  /** Section footers: what each group's models do. */
  footers: {
    conversation: 'The model new chats start with.',
    chatExtras: 'Once a reply is done, the chat’s own model names a new chat and suggests follow-ups.',
    speech: 'Speech-to-text for transcripts, imports and dictation.',
    readAloud: 'Read aloud speaks replies; play a sample to hear a voice.',
    images: 'Used when you ask chat for an image.',
    meetings: 'Writes each meeting’s overview, decisions and action items.',
    meetingSearch: 'Meeting search finds meetings and chats by meaning, on this device.',
  },
  /** Provider defaults: a provider's whole set in one step; the job sections below are "Build your own". */
  providerDefaults: {
    section: 'Provider defaults',
    footer: 'Each sets every job below in one step. Add providers in Providers.',
    buildYourOwn: 'Pick your own',
    inUse: 'In Use',
    useDefaults: (name: string) => `Use ${name} Defaults`,
    downloadAndUse: 'Download and Use',
    downloadNote: 'The models download in the background.',
    pageFooter: 'Change any one later under Pick your own.',
    deviceRow: (device: string, set: string) => `${device} · ${set}`,
    /** This device's sets (`ON_DEVICE_SETS`). */
    sets: {
      western: { title: 'Western', description: 'English and European languages' },
      indic: { title: 'Indic', description: 'Indian languages' },
    },
    failed: (name: string) => `Couldn’t reach ${name}. Nothing was changed.`,
    noChat: (name: string) => `${name} doesn’t list its default chat model. Nothing was changed.`,
  },
  /** Titles & follow-ups: a switch for each. */
  chatExtras: {
    section: 'Titles & follow-ups',
    titles: 'Name chats automatically',
    followUps: 'Suggest follow-ups',
  },
} as const;
