/** Meeting search via the Rust store plugin's hybrid search (KNN + FTS5 + RRF), grouped by meeting. */

import { embedQueries, isEmbeddingMissing } from './embeddings';
import { vectorDB } from './client';
import type { SearchHit } from './client';
import type { SearchOptions } from './types';
import { DEFAULT_SEARCH_LIMIT } from './constants';

export interface MeetingSearchResult {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  timestamp: number;
}

const toResult = (hit: SearchHit): MeetingSearchResult => ({
  meetingId: hit.meeting_id,
  meetingTitle: hit.meeting_title,
  chunkText: hit.chunk_text,
  chunkType: hit.chunk_type,
  score: hit.score,
  timestamp: hit.created_at,
});

/** One query through the store's search; an empty embedding means full-text alone. Never rejects. */
async function query(text: string, embedding: number[], options: SearchOptions): Promise<MeetingSearchResult[]> {
  const { limit = DEFAULT_SEARCH_LIMIT, meetingIds } = options;
  const mode = embedding.length > 0 ? options.mode ?? 'hybrid' : 'fulltext';
  try {
    const hits = await vectorDB.search({ embedding, query_text: text, limit, mode, ...(meetingIds?.length && { meeting_ids: meetingIds }) });
    return hits.map(toResult);
  } catch (error) {
    console.error('[RAGSearcher] Search failed:', error);
    return [];
  }
}

/** The queries' vectors in one call; none (full-text search) without the embedding model. */
async function embedOrNone(texts: string[]): Promise<number[][] | null> {
  try {
    return await embedQueries(texts);
  } catch (error) {
    if (!isEmbeddingMissing(error)) console.error('[RAGSearcher] Embedding failed, falling back to full-text:', error);
    return null;
  }
}

async function searchMeetings(text: string, options: SearchOptions = {}): Promise<MeetingSearchResult[]> {
  const vectors = options.mode === 'fulltext' ? null : await embedOrNone([text]);
  return query(text, vectors?.[0] ?? [], options);
}

/** Several queries within one meeting (a meeting that is recording, too), their vectors in one call: each query's hits. */
async function searchWithin(meetingId: string, texts: string[], limit: number): Promise<MeetingSearchResult[][]> {
  if (texts.length === 0) return [];
  const vectors = await embedOrNone(texts);
  return Promise.all(texts.map((text, i) => query(text, vectors?.[i] ?? [], { meetingIds: [meetingId], limit })));
}

export const ragSearcher = {
  search: searchMeetings,
  searchWithin,
};
