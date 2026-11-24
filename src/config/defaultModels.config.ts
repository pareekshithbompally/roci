/** Settings › Default Models copy: which model does each job; pickers list models from Providers. */

export const DEFAULT_MODELS_CONFIG = {
  jobs: {
    chat: { title: 'Chat' },
    chatExtras: { title: 'Model' },
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
    chatExtras: 'One call after a reply names a new chat and suggests follow-ups. A small model saves tokens.',
    speech: 'Speech-to-text for transcripts, imports and dictation.',
    readAloud: 'Read aloud speaks replies; play a sample to hear a voice.',
    images: 'Used when you ask chat for an image.',
    meetings: 'Writes each meeting’s overview, decisions and action items.',
    meetingSearch: 'Meeting search finds meetings and chats by meaning, on this device.',
  },
  /** Titles & follow-ups: the switches, and the picker's choice for "use the chat's own model". */
  chatExtras: {
    section: 'Titles & follow-ups',
    titles: 'Name chats automatically',
    followUps: 'Suggest follow-ups',
    sameAsChat: { value: 'same-as-chat', label: 'Same as chat' },
  },
} as const;
