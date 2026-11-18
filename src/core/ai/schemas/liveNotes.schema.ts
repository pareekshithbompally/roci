/** Output of a live-notes refresh: only the bullets that change, each edited in place by its id. */

export const LIVE_NOTES_SCHEMA = {
  type: 'object' as const,
  properties: {
    bullets: {
      type: 'array' as const,
      description: 'Only bullets that are new or whose text changes. Leave out bullets that stay as they are. Empty if nothing changes.',
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, description: 'The id of the bullet to replace, copied exactly; leave it out for a new bullet.' },
          noteId: { type: 'string' as const, description: 'The id of the user note this bullet expands; leave it out when it expands none.' },
          text: { type: 'string' as const, description: 'The full bullet: the point, then the specifics said about it (names, numbers, dates).' },
        },
        required: ['text'] as const,
        additionalProperties: false,
      },
    },
  },
  required: ['bullets'] as const,
  additionalProperties: false,
};

export interface LiveNotesChange {
  id?: string;
  noteId?: string;
  text: string;
}
