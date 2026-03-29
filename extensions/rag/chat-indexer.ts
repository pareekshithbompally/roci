/**
 * Chat Indexer
 *
 * Indexes chat sessions into the vectordb (FTS5 + sqlite-vec).
 * Uses multi-phase staleness tracking:
 *   - content_hash: tracks chunk/FTS identity
 *   - embedding_hash: tracks embedding completion
 */

import type { ChatSession } from '@/types';
import { embeddingService, preloadModel } from './embeddings';
import { vectorDB } from './client';
import { chunkChatSession, computeChatHash } from './chat-chunker';
import { emitProgress } from './progress';
import { concurrencyMap } from '@shared/utils/async.utils';
import { HASH_CONCURRENCY } from './constants';
import type { ChatChunkData } from './client';
import type { IndexingResult } from './types';

interface ChatIndexOptions {
  includeEmbeddings?: boolean;
}

/**
 * Index a single chat session.
 * No-ops if the session is already indexed with the same content hash.
 * Used for fire-and-forget indexing after chat save.
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

    const result = await indexSessionInternal(session, contentHash, options);

    // Mark embedding completion for single-session indexing
    if (result.status === 'indexed' && result.embeddingCount > 0) {
      await vectorDB.markChatEmbedded(session.id);
    }

    return result;
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
 * Batch index all chat sessions using multi-phase staleness tracking.
 *
 *   Step 1: Content-stale sessions → chunk + FTS (+ embeddings if available)
 *   Step 2: Embedding-stale sessions → re-index with embeddings
 */
async function indexAllSessions(
  sessions: ChatSession[],
  options?: ChatIndexOptions & { signal?: AbortSignal; force?: boolean },
): Promise<number> {
  const nonEmpty = sessions.filter(s => s.messages.length > 0);
  const empty = sessions.filter(s => s.messages.length === 0);

  const signal = options?.signal;
  const includeEmbeddings = options?.includeEmbeddings ?? true;
  const force = options?.force ?? false;

  await vectorDB.initialize();

  // Register empty sessions in DB so the count matches disk
  for (const s of empty) {
    try {
      await vectorDB.upsertChatSession({
        id: s.id,
        title: s.title,
        last_message_at: s.lastMessageAt,
        message_count: 0,
      });
      await vectorDB.markChatContentIndexed(s.id, 'empty');
    } catch {
      // Non-critical — empty sessions have no searchable content
    }
  }

  if (nonEmpty.length === 0) {
    console.log(`[ChatIndexer] No non-empty sessions to index (${sessions.length} total, ${empty.length} empty)`);
    return 0;
  }

  // Compute content hashes with bounded concurrency
  const hashes = await concurrencyMap(
    nonEmpty,
    async (s) => ({
      id: s.id,
      content_hash: await computeChatHash(s),
    }),
    { limit: HASH_CONCURRENCY, signal },
  );
  const hashMap = new Map(hashes.map(h => [h.id, h.content_hash]));

  let indexed = 0;

  // ── Step 1: Index content-stale sessions (chunks + FTS + optional embeddings) ──
  // When force=true, skip staleness check and re-index everything
  let staleItems: ChatSession[];
  if (force) {
    staleItems = nonEmpty;
    console.log(`[ChatIndexer] Force re-index: processing all ${nonEmpty.length} sessions`);
  } else {
    const staleIds = await vectorDB.getStaleChatSessions(hashes);
    const staleSet = new Set(staleIds);
    staleItems = nonEmpty.filter(s => staleSet.has(s.id));
  }

  if (staleItems.length > 0) {
    console.log(`[ChatIndexer] Step 1: ${staleItems.length} sessions need indexing`);
    emitProgress({ kind: 'indexing', status: 'started', total: staleItems.length, currentTitle: 'Chat: loading embedding model…' });

    // Warm up embedding model before entering the loop so the first session
    // doesn't silently block on model download while the tray shows "1/N".
    if (includeEmbeddings) {
      try {
        await preloadModel();
      } catch {
        console.warn('[ChatIndexer] Embedding model preload failed — will retry per-session');
      }
    }

    for (let i = 0; i < staleItems.length; i++) {
      if (signal?.aborted) break;
      const session = staleItems[i];

      emitProgress({
        kind: 'indexing',
        status: 'progress',
        current: i + 1,
        total: staleItems.length,
        currentTitle: `Chat: ${session.title}`,
      });

      try {
        const contentHash = hashMap.get(session.id)!;
        const result = await indexSessionInternal(session, contentHash, { includeEmbeddings });
        if (result.status === 'indexed') {
          indexed++;
          if (includeEmbeddings && result.embeddingCount > 0) {
            await vectorDB.markChatEmbedded(session.id);
          }
        } else {
          console.warn(`[ChatIndexer] Session "${session.title}" not indexed: ${result.status} (${result.reason ?? 'no reason'})`);
        }
      } catch (error) {
        console.error(`[ChatIndexer] Failed to index "${session.title}":`, error);
      }
    }

    console.log(`[ChatIndexer] Step 1 complete: indexed ${indexed}/${staleItems.length} sessions`);
    emitProgress({ kind: 'indexing', status: 'complete', current: staleItems.length, total: staleItems.length, currentTitle: 'Chat: complete' });
  } else {
    console.log(`[ChatIndexer] Step 1 skipped: all ${nonEmpty.length} sessions are up-to-date`);
  }

  // ── Step 2: Upgrade embedding-stale sessions ──
  if (includeEmbeddings) {
    const allIds = nonEmpty.map(s => s.id);
    const needsEmbeddingIds = await vectorDB.getChatsNeedingEmbeddings(allIds);

    if (needsEmbeddingIds.length > 0) {
      const needsEmbeddingSet = new Set(needsEmbeddingIds);
      const embeddingItems = nonEmpty.filter(s => needsEmbeddingSet.has(s.id));

      console.log(`[ChatIndexer] ${embeddingItems.length} sessions need embedding upgrade`);

      let embedded = 0;
      for (const session of embeddingItems) {
        if (signal?.aborted) break;

        try {
          const contentHash = hashMap.get(session.id)!;
          const result = await indexSessionInternal(session, contentHash, { includeEmbeddings: true });
          if (result.status === 'indexed' && result.embeddingCount > 0) {
            await vectorDB.markChatEmbedded(session.id);
            embedded++;
          }
        } catch (error) {
          console.error(`[ChatIndexer] Embedding upgrade failed for "${session.title}":`, error);
        }
      }

      if (embedded > 0) {
        console.log(`[ChatIndexer] Embedded ${embedded} sessions`);
      }
    }
  }

  return indexed;
}

/**
 * Core indexing logic: chunk → embed → upsert.
 * content_hash is stamped ONLY after chunks are confirmed in DB.
 */
async function indexSessionInternal(
  session: ChatSession,
  contentHash: string,
  options?: ChatIndexOptions,
): Promise<IndexingResult> {
  const chunks = chunkChatSession(session);

  // Always upsert session metadata so the DB count matches disk count
  await vectorDB.upsertChatSession({
    id: session.id,
    title: session.title,
    last_message_at: session.lastMessageAt,
    message_count: session.messages.length,
  });

  if (chunks.length === 0) {
    // Stamp content_hash so this session isn't perpetually stale
    await vectorDB.markChatContentIndexed(session.id, contentHash);
    return { status: 'skipped', reason: 'no_chunks', chunkCount: 0, embeddingCount: 0 };
  }

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

  // Stamp content_hash AFTER chunks are confirmed — prevents hash poisoning on partial failure
  await vectorDB.markChatContentIndexed(session.id, contentHash);

  console.log(`[ChatIndexer] Indexed session "${session.title}" (${chunks.length} turns)`);
  return {
    status: 'indexed',
    chunkCount: chunkDataList.length,
    embeddingCount: embeddings?.length ?? 0,
  };
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
  indexAllSessions,
  removeSession,
};
