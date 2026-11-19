/** Live enhanced notes on the record screen: when the notes are refreshed, and the screen's words. */

export const LIVE_NOTES_CONFIG = {
  /** Update the AI notes each time the meeting moves on this far past the transcript the last update covered (ms). */
  transcriptStepMs: 20_000,
  /** Refresh (and save the typed lines) this long after typing stops (ms). */
  typingIdleMs: 2_000,
  /** The transcript keeps following the newest line while the reader is within this distance of its end (px). */
  followSlackPx: 48,
  /** Ids the client gives bullets: "b1", "b2"… short so the model copies them exactly. */
  bulletIdPrefix: 'b',
  /** What an update recalls of the meeting so far from its search index (indexed stretch by stretch while it records). */
  recall: {
    /** Earlier passages per query (each new or changed note, and the new transcript), most related first. */
    passagesPerQuery: 3,
    /** Characters of earlier passages one update may carry. */
    earlierChars: 6_000,
    /** The newest points always sent; older ones only when their talk was recalled. */
    recentPoints: 5,
  },
  copy: {
    yourNotes: 'Your notes',
    aiNotes: 'AI notes',
    liveTranscript: 'Live transcript',
    transcript: 'Transcript',
    /** The in-call transcript after Stop, until the final one replaces it. */
    draftTranscript: 'Transcript · draft',
    placeholder: 'Type shorthand, one thought per line. Each line is filled in from what was being said.',
    aiEmpty: 'AI notes build here as the meeting goes. Lines you jot in Your notes are filled in and given more detail.',
    aiEmptyAfter: 'Lines you jot in Your notes are filled in from the transcript when the summary is written.',
    sections: 'Meeting sections',
  },
} as const;

/** The notes pane's switch: one view at a time. */
export const NOTES_VIEWS = ['notes', 'ai'] as const;
export type NotesView = (typeof NOTES_VIEWS)[number];

/** A phone's sections, one at a time. */
export const PHONE_SECTIONS = ['transcript', ...NOTES_VIEWS] as const;
export type PhoneSection = (typeof PHONE_SECTIONS)[number];
