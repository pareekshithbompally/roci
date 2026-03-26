/**
 * Chat Indexer
 *
 * Indexes a chat session into the vectordb (FTS5 + sqlite-vec).
 * Mirrors ragIndexer in structure: chunk → embed → upsert.
 * Called fire-and-forget after chatService.persistSession().
 */

import type { ChatSession } from '@/types';
import { embeddingService } from './embeddings';
import { vectorDB } from './client';
import { chunkChatSession, computeChatHash } from './chat-chunker';
import type { ChatChunkData } from './client';
import type { IndexingResult } from './types';

interface ChatIndexOptions {
  includeEmbeddings?: boolean;
}

/**
 * Index a single chat session.
 * No-ops if the session is already indexed with the same content hash.
 * Returns a structured result so callers can distinguish indexed vs skipped vs failed.
 */
async function indexSession(
  session: ChatSession,
  options?: ChatIndexOptions,
): Promise<IndexingResult> {
  if (session.messages.length === 0) {
    return { status: 'skipped', reason: 'empty_session', chunkCount: 0, embeddingCount: 0 };
  }

  try {
    await vectorDB.initialize();

    const contentHash = await computeChatHash(session);

    const isStale = await vectorDB.isChatSessionStale(session.id, contentHash);
    if (!isStale) {
      return { status: 'skipped', reason: 'up_to_date', chunkCount: 0, embeddingCount: 0 };
    }

    const chunks = chunkChatSession(session);
    if (chunks.length === 0) {
      return { status: 'skipped', reason: 'no_chunks', chunkCount: 0, embeddingCount: 0 };
    }

    // Upsert session metadata first (FK constraint on chat_chunks)
    await vectorDB.upsertChatSession({
      id: session.id,
      title: session.title,
      last_message_at: session.lastMessageAt,
      message_count: session.messages.length,
      content_hash: contentHash,
    });

    // Embed all turn texts in a single batch
    const chunkTexts = chunks.map(c => c.text);
    let embeddings: number[][] | null = null;
    if (options?.includeEmbeddings !== false) {
      try {
        embeddings = await embeddingService.embedBatch(chunkTexts);
      } catch (error) {
        console.error(`[ChatIndexer] Embedding failed for session "${session.title}":`, error);
      }
    }

    const chunkDataList: ChatChunkData[] = chunks.map((chunk, i) => ({
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      chunk_type: chunk.type,
      embedding: embeddings?.[i],
    }));

    await vectorDB.upsertChatChunks(session.id, chunkDataList);

    console.log(`[ChatIndexer] Indexed session "${session.title}" (${chunks.length} turns)`);
    return {
      status: 'indexed',
      chunkCount: chunkDataList.length,
      embeddingCount: embeddings?.length ?? 0,
    };
  } catch (error) {
    console.error(`[ChatIndexer] Failed to index session "${session.title}":`, error);
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown_error',
      chunkCount: 0,
      embeddingCount: 0,
    };
  }
}

/**
 * Remove a chat session and all its chunks/vectors from the index.
 * Called when a session is deleted.
 */
async function removeSession(sessionId: string): Promise<void> {
  try {
    await vectorDB.deleteChatSession(sessionId);
    console.log(`[ChatIndexer] Removed session ${sessionId}`);
  } catch (error) {
    console.warn(`[ChatIndexer] Cleanup failed for session ${sessionId}:`, error);
  }
}

export const chatIndexer = {
  indexSession,
  removeSession,
};
