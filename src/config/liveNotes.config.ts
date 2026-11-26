/** A meeting's notes beside its transcript: when typed lines are saved, and the screen's words. */

export const LIVE_NOTES_CONFIG = {
  /** Save the typed lines this long after typing stops (ms). */
  typingIdleMs: 2_000,
  /** The transcript keeps following the newest line while the reader is within this distance of its end (px). */
  followSlackPx: 48,
  /** Ids of the summary's filled-in notes as AI lines: "b1", "b2"… */
  bulletIdPrefix: 'b',
  copy: {
    yourNotes: 'Your notes',
    /** A phone's one-word segments while recording (a segment is half the screen). */
    sectionShort: { transcript: 'Transcript', notes: 'Notes' },
    aiNotes: 'AI Summary',
    liveTranscript: 'Live transcript',
    transcript: 'Transcript',
    /** The in-call transcript after Stop, until the final one replaces it. */
    draftTranscript: 'Transcript · draft',
    placeholder: 'Type shorthand, one thought per line. Each line is filled in from what was being said.',
    aiEmptyAfter: 'Lines you jot in Your notes are filled in from the transcript when the summary is written.',
    sections: 'Meeting sections',
  },
} as const;

/** The notes pane's switch: one view at a time. */
export const NOTES_VIEWS = ['ai', 'notes'] as const;
export type NotesView = (typeof NOTES_VIEWS)[number];

/** A phone's sections while recording, one at a time. */
export const PHONE_SECTIONS = ['transcript', 'notes'] as const;
export type PhoneSection = (typeof PHONE_SECTIONS)[number];
