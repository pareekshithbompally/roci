/** Output of a live-notes update, defined once: the meeting's new or changed points, and the user's notes filled in (keyed by
 *  the note, so each updates in place). Only what is new or changes comes back. */

import { z } from 'zod';

const text = z.string().trim().min(1).describe('One or two short sentences: the point, then the specifics (names, numbers, dates). No times, no ids.');

const points = z.array(z.strictObject({
  id: z.string().optional().describe('The id of a point so far, to correct it; leave it out for a new point.'),
  text,
})).describe('New points from the new transcript, and points so far that it corrects. Empty for small talk.');

/** The schema for one update; `noteIds` are the user notes' short ids, the only ones a filled note may name. */
export function liveNotesSchema(noteIds: string[]) {
  const [first, ...rest] = noteIds;
  if (!first) return z.strictObject({ points });
  return z.strictObject({
    points,
    filled: z.array(z.strictObject({
      noteId: z.enum([first, ...rest]).describe('The note this fills in.'),
      text,
    })).describe('User notes whose filled-in text is new or changes, one item per note. Leave out notes that stay as they are.'),
  });
}

/** One change to the AI notes: a user note filled in (`noteId`), or a point (`id` to change one, none to add). */
export interface LiveNotesChange {
  id?: string;
  noteId?: string;
  text: string;
}
