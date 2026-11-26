/** Sources domain: how far indexing each knowledge source (a meeting, a chat, a library file) has got. */

import { call } from '@services/db/internal';
import type { SourceStatus } from '@shared/types/native';

/** A kind of knowledge source, as the search index names it. */
export type SourceKind = 'meeting' | 'chat' | 'file';

export const sources = {
  /** Every source of `kind` with an index state (Indexing… / Ready / Couldn't read). */
  async states(kind: SourceKind): Promise<SourceStatus[]> {
    return call<SourceStatus[]>('index_states', { kind });
  },


};
