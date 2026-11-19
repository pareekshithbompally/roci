/** The in-call transcript: who each recorded source is, and how its echo is recognised. */

import type { MeetingSource } from '@shared/types/native';

export const MEETING_LIVE_CONFIG = {
  /** Rust → webview (src-tauri/src/audio/live.rs): one chunk of a source, and the end of the recording's chunks. */
  chunkEvent: 'meeting-live://chunk',
  doneEvent: 'meeting-live://done',
  /** Chunks are 16 kHz mono 16-bit PCM. */
  sampleRate: 16_000,
  /** The speaker label of each source in the transcript. */
  speakers: { microphone: 'You', system: 'Others' } satisfies Record<MeetingSource, string>,
  /** After Stop, how long to wait for the recorder's last chunks before giving up on them; the full recording is then
   *  transcribed instead (ms). */
  doneTimeoutMs: 15_000,
  /** A source with more audio than this waiting to be transcribed drops its oldest chunks to catch up (ms). */
  maxBacklogMs: 120_000,
  /** A hard-cut chunk's re-heard start: up to this many words matching the end of the previous line, found within the first
   *  `slack` words (the model may hear the overlap a little differently), and at least `minWords` so a lone repeated word stays. */
  seam: { maxWords: 12, minWords: 2, slack: 3 },
  /** Echo of the other side through the speakers: microphone entries closer than `utteranceGapMs` are judged together; when the
   *  sound can't tell, an utterance is echo if `similarity` of its words (fuzzily) appear in the other side's speech within
   *  `windowMs`; a line of at least `sentenceWords` words the sound shows is local survives its echoing neighbours. */
  echo: { windowMs: 1_500, utteranceGapMs: 700, sentenceWords: 3, similarity: 0.6 },
  copy: {
    recording: 'Recording',
    listening: 'Listening…',
    paused: 'Paused',
    /** Under the draft transcript after Stop, while the final one is made. */
    finalizing: 'Building the final transcript…',
    none: 'No transcript yet.',
    unavailable: 'Live transcript unavailable. The full transcript is made when you stop.',
    empty: 'Words appear here as they are said, labelled by who said them.',
    noModel: 'Choose a speech model in Settings › Default Models to see words as they are said.',
  },
} as const;

/** A recorded source, as Rust names it. */
export type MeetingSourceId = MeetingSource;
