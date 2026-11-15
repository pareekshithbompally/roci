/** Recordings domain — upsert/list/delete recording rows. */

import { call } from '@services/db/internal';

export const recordings = {
  /** Upsert a recording row. */
  async upsert(input: {
    id: string;
    meetingId?: string;
    filename: string;
    durationSeconds?: number;
    inputSource?: string;
    createdAt?: number;
  }): Promise<void> {
    await call<void>('recordings_upsert', {
      input: {
        id: input.id,
        meeting_id: input.meetingId ?? null,
        filename: input.filename,
        duration_seconds: input.durationSeconds ?? null,
        input_source: input.inputSource ?? null,
        created_at: input.createdAt ?? null,
      },
    });
  },

  /** List recordings for a meeting. */
  async listForMeeting(meetingId: string): Promise<Array<{
    id: string;
    filename: string;
    durationSeconds: number | null;
    inputSource: string | null;
    createdAt: number;
  }>> {
    const rows = await call<Array<{
      id: string;
      filename: string;
      duration_seconds: number | null;
      input_source: string | null;
      created_at: number;
    }>>('recordings_list_for_meeting', { meeting_id: meetingId });
    return rows.map(r => ({
      id: r.id,
      filename: r.filename,
      durationSeconds: r.duration_seconds,
      inputSource: r.input_source,
      createdAt: r.created_at,
    }));
  },

  /** Delete a recording row by filename. Returns the recording ID if found. */
  async delete(filename: string): Promise<string | null> {
    return call<string | null>('recordings_delete', { filename });
  },

  /** List orphan recordings (no meeting assigned). */
  async listOrphan(): Promise<Array<{
    id: string;
    filename: string;
    durationSeconds: number | null;
    inputSource: string | null;
    createdAt: number;
  }>> {
    const rows = await call<Array<{
      id: string;
      filename: string;
      duration_seconds: number | null;
      input_source: string | null;
      created_at: number;
    }>>('recordings_list_orphan');
    return rows.map(r => ({
      id: r.id,
      filename: r.filename,
      durationSeconds: r.duration_seconds,
      inputSource: r.input_source,
      createdAt: r.created_at,
    }));
  },
};
