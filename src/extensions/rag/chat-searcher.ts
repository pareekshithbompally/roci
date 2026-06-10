/**
 * Chat Searcher
 *
 * Delegates hybrid search to the Rust store plugin.
 * Mirrors ragSearcher in structure.
 */

import { embeddingService } from './embeddings';
import { vectorDB } from './client';
import type { ChatSearchHit } from './client';
import type { SearchOptions } from './types';
import { DEFAULT_CHAT_SEARCH_LIMIT } from './constants';

export interface ChatSearchResult {
  sessionId: string;
  sessionTitle: string;
  chunkText: string;
  chunkType: string;
  score: number;
  lastMessageAt: number;
}

async function searchChats(
  query: string,
  options: SearchOptions = {},
): Promise<ChatSearchResult[]> {
  const { limit = DEFAULT_CHAT_SEARCH_LIMIT, mode = 'hybrid' } = options;

  await vectorDB.initialize();

  let embedding: number[] = [];
  if (mode !== 'fulltext') {
    try {
      embedding = await embeddingService.embed(query);
    } catch (error) {
      console.error('[ChatSearcher] Embedding failed, falling back to fulltext:', error);
      return searchChats(query, { ...options, mode: 'fulltext' });
    }
  }

  try {
    const hits: ChatSearchHit[] = await vectorDB.searchChats({
      embedding,
      query_text: query,
      limit,
      mode,
    });

    return hits.map(hit => ({
      sessionId: hit.chat_id,
      sessionTitle: hit.chat_title,
      chunkText: hit.chunk_text,
      chunkType: hit.chunk_type,
      score: hit.score,
      lastMessageAt: hit.last_message_at,
    }));
  } catch (error) {
    console.error('[ChatSearcher] Search failed:', error);
    return [];
  }
}

export const chatSearcher = {
  search: searchChats,
};
