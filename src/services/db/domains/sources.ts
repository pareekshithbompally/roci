/** Sources domain: how far indexing each knowledge source (a meeting, a chat, a library file) has got, and the sources
 *  about the same thing as one, by meaning (worked out on the device when asked). */

import { call } from '@services/db/internal';
import type { RelatedSource, SourceStatus } from '@shared/types/native';

/** A kind of knowledge source, as the search index names it. */
export type SourceKind = 'meeting' | 'chat' | 'file';

export const sources = {
  /** Every source of `kind` with an index state (Indexing… / Ready / Couldn't read). */
  async states(kind: SourceKind): Promise<SourceStatus[]> {
    return call<SourceStatus[]>('index_states', { kind });
  },

  /** The sources about the same thing as this one (itself left out), at least `minScore` alike, best first. */
  async related(kind: SourceKind, id: string, minScore: number, limit: number): Promise<RelatedSource[]> {
    return call<RelatedSource[]>('related_sources', { kind, id, minScore, limit });
  },
};
