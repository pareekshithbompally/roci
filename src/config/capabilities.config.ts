/** Settings › Capabilities copy; pickers list models from Providers and switched-on Integrations. */

export const CAPABILITIES_CONFIG = {
  description: 'What Roci can do, and the model behind each. Add sources in Providers or Integrations.',
  jobs: {
    chat: { title: 'Chat', description: 'Default model for new chats.' },
    transcription: { title: 'Speech recognition (STT)', description: 'Transcripts, imports and dictation.' },
    summaries: { title: 'Summaries', description: 'Overview, decisions and action items.' },
    meetingSearch: { title: 'Meeting search' },
    readAloud: { title: 'Read aloud (TTS)', description: 'How replies are spoken aloud.' },
    voice: { title: 'Voice', description: 'Play a sample to hear it.' },
  },
} as const;
