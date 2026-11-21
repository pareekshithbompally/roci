/** The in-call transcript: who each recorded source is, and how its echo is recognised. */

import type { MeetingSource } from '@shared/types/native';
import type { AudioCaptureSource } from '@config/audio.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

export const MEETING_LIVE_CONFIG = {
  /** Rust → webview (src-tauri/src/audio/live.rs): one chunk (or frame) of a source. */
  chunkEvent: 'meeting-live://chunk',
  /** Where the draft is kept for the window's session (sessionStorage), so a reload mid-recording keeps it. */
  storageKey: 'roci-meeting-live',
  /** Chunks are mono 16-bit PCM at the transcription sample rate. */
  sampleRate: TRANSCRIPTION_CONFIG.sampleRate,
  /** The sides a capture source records; a meeting that streams runs one stream per side (an imported file streams none). */
  sides: { microphone: ['microphone'], system: ['system'], systemAndMicrophone: ['microphone', 'system'], 'file-upload': [] } satisfies Record<AudioCaptureSource, MeetingSource[]>,
  /** The speaker label of each source in the transcript. */
  speakers: { microphone: 'You', system: 'Others' } satisfies Record<MeetingSource, string>,
  /** A source with more audio than this waiting to be transcribed drops its oldest chunks to catch up; the draft then says it
   *  has a gap (ms). */
  maxBacklogMs: 120_000,
  /** A hard-cut chunk's re-heard start: with word times, the chunks join at a word both heard within `anchorMs` of each other
   *  inside the overlap; without, its first `minWords`–`maxWords` words repeating the previous line are dropped. A sentence ends
   *  at . ? ! or a pause of `sentencePauseMs`. */
  seam: { maxWords: 12, minWords: 2, anchorMs: 300, sentencePauseMs: 600 },
  /** Echo of the other side through the speakers: microphone entries closer than `utteranceGapMs` are judged together; when the
   *  sound can't tell, an utterance is echo if `similarity` of its words (fuzzily) appear in the other side's speech within
   *  `windowMs`; a line of at least `sentenceWords` words the sound shows is local survives its echoing neighbours. */
  echo: { windowMs: 1_500, utteranceGapMs: 700, sentenceWords: 3, similarity: 0.6 },
  copy: {
    /** Stops and keeps the audio and live transcript; the summary waits for Summarize. */
    saveForLater: 'Save for Later',
    /** The recording's models, named under its title. */
    transcribing: 'Transcribing with',
    summarizing: 'Summarizing with',
    /** A meeting's empty transcript while its final one is being made. */
    finalizing: 'Building the final transcript…',
    none: 'No transcript yet.',
    unavailable: 'Live transcript unavailable. Audio is still recording safely.',
    empty: 'Listening for speech…',
    noModel: 'Choose a speech model in Settings › Default Models to see words as they are said.',
  },
} as const;

/** A recorded source, as Rust names it. */
export type MeetingSourceId = MeetingSource;
