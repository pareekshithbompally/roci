/** Settings › Default Models copy: which model does each job; pickers list models from Providers. */

export const DEFAULT_MODELS_CONFIG = {
  jobs: {
    chat: { title: 'Chat' },
    transcription: { title: 'Speech recognition' },
    summaries: { title: 'Summaries' },
    meetingSearch: { title: 'Meeting search' },
    readAloud: { title: 'Read aloud' },
    images: { title: 'Image generation' },
    voice: { title: 'Voice' },
  },
  /** Section footers: what each group's models do. */
  footers: {
    conversation: 'The model new chats start with.',
    speech: 'Speech-to-text for transcripts, imports and dictation.',
    readAloud: 'Read aloud speaks replies; play a sample to hear a voice.',
    images: 'Used when you ask chat for an image.',
    meetings: 'Writes each meeting’s overview, decisions and action items.',
    meetingSearch: 'Meeting search finds meetings and chats by meaning, on this device.',
  },
} as const;
