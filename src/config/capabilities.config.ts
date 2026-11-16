/** Settings › Capabilities copy; pickers list models from Providers and switched-on Integrations. */

export const CAPABILITIES_CONFIG = {
  description: 'What Kasset can do, and the model behind each. Add sources in Providers or Integrations.',
  jobs: {
    chat: { title: 'Chat', description: 'Default model for new chats.' },
    transcription: { title: 'Speech recognition (STT)', description: 'Meeting transcripts, imported recordings and dictation.' },
    summaries: { title: 'Summaries', description: 'Overview, decisions and action items for each meeting.' },
    meetingSearch: { title: 'Meeting search' },
    readAloud: { title: 'Read aloud (TTS)', description: 'How replies are spoken. macOS voices are built in; Phonon downloads once.' },
    voice: { title: 'Voice', description: 'Play a sample to hear it.' },
  },
} as const;
