/** Dictations domain — every dictation made in the app, newest first. */

import { call } from '@services/db/internal';
import type { PaginatedResult } from '@services/db/types';
import type { Dictation } from '@shared/types';

interface DictationRow {
  id: string;
  text: string;
  created_at: number;
  duration_ms: number | null;
  model: string | null;
}

const fromRow = (row: DictationRow): Dictation => ({
  id: row.id,
  text: row.text,
  createdAt: row.created_at,
  ...(row.duration_ms !== null && { durationMs: row.duration_ms }),
  ...(row.model !== null && { model: row.model }),
});

const toRow = (dictation: Dictation): DictationRow => ({
  id: dictation.id,
  text: dictation.text,
  created_at: dictation.createdAt,
  duration_ms: dictation.durationMs ?? null,
  model: dictation.model ?? null,
});

export const dictations = {
  async list(limit: number, offset = 0): Promise<PaginatedResult<Dictation>> {
    const result = await call<{ items: DictationRow[]; total: number }>('dictations_list', { limit, offset });
    return { items: result.items.map(fromRow), total: result.total };
  },

  create(dictation: Dictation): Promise<void> {
    return call<void>('dictations_create', { input: toRow(dictation) });
  },

  delete(id: string): Promise<void> {
    return call<void>('dictations_delete', { id });
  },
};
