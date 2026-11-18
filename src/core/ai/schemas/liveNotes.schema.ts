/** Output of a live-notes refresh: each user note filled in (keyed by the note, so it updates in place), and extras for agreed
 *  points no note covers. Only what is new or changes comes back. */

const TEXT_DESCRIPTION = 'One or two short sentences: the point, then the specifics said about it (names, numbers, dates). No times, no ids.';

/** The schema for one refresh; `noteIds` are the notes' short ids, the only ones a filled note may name. */
export function liveNotesSchema(noteIds: string[]) {
  const filled = noteIds.length > 0 && {
    filled: {
      type: 'array' as const,
      description: 'Notes whose filled-in text is new or changes, one item per note. Leave out notes that stay as they are.',
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
      ...filled,
      extras: {
        type: 'array' as const,
        description: 'Decisions, deadlines or tasks clearly agreed that no note covers; new or changed ones only. Usually empty.',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'An existing extra’s id to change it; leave it out for a new one.' },
            text: { type: 'string' as const, description: TEXT_DESCRIPTION },
          },
          required: ['text'] as const,
          additionalProperties: false,
        },
      },
    },
    required: [...(filled ? ['filled' as const] : []), 'extras' as const],
    additionalProperties: false,
  };
}

/** One change to the AI notes: a note filled in (`noteId`), or an extra (`id` to change one, none to add). */
export interface LiveNotesChange {
  id?: string;
  noteId?: string;
  text: string;
}
