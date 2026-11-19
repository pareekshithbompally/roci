/** Notes domain — list/upsert/delete meeting notes. */

import { call, rustNoteToEntry } from '@services/db/internal';
import type { NoteRow } from '@shared/types/native';
import type { NoteEntry } from '@shared/types';
import { meetingEdited } from './meetingEdits';

export const notes = {
  /** List notes for a meeting. */
  async list(meetingId: string): Promise<NoteEntry[]> {
    const rows = await call<NoteRow[]>('notes_list', { meetingId });
    return rows.map(rustNoteToEntry);
  },

  /** Create or update a note. */
  async upsert(note: { id: string; meetingId: string; text: string; createdAt?: string }): Promise<void> {
    await call<void>('notes_upsert', {
      input: {
        id: note.id,
        meeting_id: note.meetingId,
        text: note.text,
        created_at: note.createdAt ? new Date(note.createdAt).getTime() : null,
      },
    });
    meetingEdited(note.meetingId);
  },

  /** Delete one of a meeting's notes. */
  async delete(id: string, meetingId: string): Promise<void> {
    await call<void>('notes_delete', { id });
    meetingEdited(meetingId);
  },
};
