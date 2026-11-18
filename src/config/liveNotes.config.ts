/** Live enhanced notes on the record screen: when the notes are refreshed, and the screen's words. */

export const LIVE_NOTES_CONFIG = {
  /** Update the AI notes each time this much new speech has arrived since the last update (ms). */
  transcriptStepMs: 20_000,
  /** Refresh (and save the typed lines) this long after typing stops (ms). */
  typingIdleMs: 2_000,
  /** The transcript keeps following the newest line while the reader is within this distance of its end (px). */
  followSlackPx: 48,
  /** Ids the client gives bullets: "b1", "b2"… short so the model copies them exactly. */
  bulletIdPrefix: 'b',
  copy: {
    yourNotes: 'Your notes',
    aiNotes: 'AI notes',
    transcript: 'Live transcript',
    transcribing: 'Transcribing…',
    placeholder: 'Type shorthand, one thought per line. Each line is filled in from what was being said.',
    aiEmpty: 'AI notes build here as the meeting goes. Lines you jot in Your notes are filled in and given more detail.',
    noModel: 'Choose a Summary model in Settings › Default Models to fill in your notes.',
    enhancing: 'Enhancing your notes…',
    sections: 'Meeting sections',
    /** The meeting's Overview: the notes filled in, and the wait for the final pass after Stop. */
    enhancedTitle: 'Your notes, enhanced',
    finishing: 'Finishing your notes…',
  },
} as const;

/** The notes pane's switch: one view at a time. */
export const NOTES_VIEWS = ['notes', 'ai'] as const;
export type NotesView = (typeof NOTES_VIEWS)[number];

/** A phone's sections, one at a time. */
export const PHONE_SECTIONS = ['transcript', ...NOTES_VIEWS] as const;
export type PhoneSection = (typeof PHONE_SECTIONS)[number];
