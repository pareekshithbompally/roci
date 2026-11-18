/** Live enhanced notes on the record screen: when the notes are refreshed, and the screen's words. */

export const LIVE_NOTES_CONFIG = {
  /** Refresh once this much transcript has arrived since the last refresh (ms). */
  transcriptStepMs: 45_000,
  /** Refresh (and save the typed lines) this long after typing stops (ms). */
  typingIdleMs: 2_000,
  /** Turns the collapsed transcript strip shows. */
  collapsedTurns: 2,
  /** Ids the client gives bullets: "b1", "b2"… short so the model copies them exactly. */
  bulletIdPrefix: 'b',
  copy: {
    yourNotes: 'Your notes',
    enhanced: 'Enhanced notes',
    transcript: 'Live transcript',
    placeholder: 'Type shorthand, one thought per line. Each line is filled in from what was being said.',
    enhancedEmpty: 'Your lines are filled in here from what was said around them.',
    noModel: 'Choose a Summary model in Settings › Default Models to fill in your notes.',
    updating: 'Updating…',
    expand: 'Expand transcript',
    collapse: 'Collapse transcript',
  },
} as const;

/** The record screen's sections (a phone shows one at a time). */
export const LIVE_NOTES_TABS = [
  { value: 'notes', label: 'Notes' },
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'transcript', label: 'Transcript' },
] as const;

export type LiveNotesTab = (typeof LIVE_NOTES_TABS)[number]['value'];
