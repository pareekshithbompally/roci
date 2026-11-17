/** Meeting search via the Rust store plugin's hybrid search (KNN + FTS5 + RRF), grouped by meeting. */

import { embedQuery, isEmbeddingMissing } from './embeddings';
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

async function searchMeetings(
  query: string,
  options: SearchOptions = {},
): Promise<MeetingSearchResult[]> {
  const { limit = DEFAULT_SEARCH_LIMIT, mode = 'hybrid', meetingIds } = options;

  await vectorDB.initialize();

  // For fulltext-only mode, we don't need embeddings
  let embedding: number[] = [];
  if (mode !== 'fulltext') {
    try {
      embedding = await embedQuery(query);
    } catch (error) {
      if (!isEmbeddingMissing(error)) {
        console.error('[RAGSearcher] Embedding failed, falling back to fulltext:', error);
      }
      return searchMeetings(query, { ...options, mode: 'fulltext' });
    }
  }

  try {
    const hits: SearchHit[] = await vectorDB.search({
      embedding,
      query_text: query,
      limit,
      mode,
      ...(meetingIds?.length && { meeting_ids: meetingIds }),
    });

    return hits.map((hit) => ({
      meetingId: hit.meeting_id,
      meetingTitle: hit.meeting_title,
      chunkText: hit.chunk_text,
      chunkType: hit.chunk_type,
      score: hit.score,
      timestamp: hit.created_at,
    }));
  } catch (error) {
    console.error('[RAGSearcher] Search failed:', error);
    return [];
  }
}

export const ragSearcher = {
  search: searchMeetings,
};
