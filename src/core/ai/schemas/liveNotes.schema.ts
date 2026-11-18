/** Output of a live-notes update: the meeting's new or changed points, and the user's notes filled in (keyed by the note, so
 *  each updates in place). Only what is new or changes comes back. */

const TEXT_DESCRIPTION = 'One or two short sentences: the point, then the specifics (names, numbers, dates). No times, no ids.';

/** The schema for one update; `noteIds` are the user notes' short ids, the only ones a filled note may name. */
export function liveNotesSchema(noteIds: string[]) {
  const filled = noteIds.length > 0 && {
    filled: {
      type: 'array' as const,
      description: 'User notes whose filled-in text is new or changes, one item per note. Leave out notes that stay as they are.',
      items: {
        type: 'object' as const,
        properties: {
          noteId: { type: 'string' as const, enum: noteIds, description: 'The note this fills in.' },
          text: { type: 'string' as const, description: TEXT_DESCRIPTION },
        },
        required: ['noteId', 'text'] as const,
        additionalProperties: false,
      },
    },
  };
  return {
    type: 'object' as const,
    properties: {
      points: {
        type: 'array' as const,
        description: 'New points from the new transcript, and points so far that it adds to or corrects. Empty for small talk.',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'The id of a point so far, to update it; leave it out for a new point.' },
            text: { type: 'string' as const, description: TEXT_DESCRIPTION },
          },
          required: ['text'] as const,
          additionalProperties: false,
        },
      },
      ...filled,
    },
    required: ['points' as const, ...(filled ? ['filled' as const] : [])],
    additionalProperties: false,
  };
}

/** One change to the AI notes: a user note filled in (`noteId`), or a point (`id` to change one, none to add). */
export interface LiveNotesChange {
  id?: string;
  noteId?: string;
  text: string;
}
