/** The in-call transcript: who each recorded source is, and how its echo is recognised. */

export const MEETING_LIVE_CONFIG = {
  /** Rust → webview (src-tauri/src/audio/live.rs): one chunk of a source, and the end of the recording's chunks. */
  chunkEvent: 'meeting-live://chunk',
  doneEvent: 'meeting-live://done',
  /** Chunks are 16 kHz mono 16-bit PCM. */
  sampleRate: 16_000,
  /** The speaker label of each source in the transcript. */
  speakers: { microphone: 'You', system: 'Others' },
  /** A source with more audio than this waiting to be transcribed drops its oldest chunks to catch up (ms). */
  maxBacklogMs: 120_000,
  /** A hard-cut chunk's re-heard start: up to this many words matching the end of the previous line, found within the first
   *  `slack` words (the model may hear the overlap a little differently), and at least `minWords` so a lone repeated word stays. */
  seam: { maxWords: 12, minWords: 2, slack: 3 },
  /** A microphone entry overlapping a system entry and sharing at least this share of its words is the speakers' echo. */
  echoWordShare: 0.6,
  copy: {
    listening: 'Listening…',
    paused: 'Paused',
    transcribing: 'Transcribing as you speak',
    empty: 'Words appear here as they are said, labelled by who said them.',
    noModel: 'Choose a speech model in Settings › Default Models to see words as they are said.',
  },
} as const;

export type MeetingSourceId = keyof typeof MEETING_LIVE_CONFIG.speakers;
