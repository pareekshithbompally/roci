/** Indexes chat sessions (FTS5 + sqlite-vec), tracking content_hash and embedding_hash separately. */

import type { ChatSession } from '@shared/types';
import { embedDocuments, isEmbeddingMissing } from './embeddings';
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

/** Indexes one session after save; no-op when its content hash is unchanged. */
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

    return await indexSessionInternal(session, contentHash, options);
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

/** Indexes content-stale sessions first, then re-embeds embedding-stale ones. */
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
      await vectorDB.markChatIndexed({
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
    emitProgress({ kind: 'indexing', status: 'started', total: staleItems.length, currentTitle: 'Chat: indexing…' });

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
          if (result.status === 'indexed' && result.embeddingCount > 0) embedded++;
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

/** The turns to embed: those without a vector yet (a turn whose text is unchanged keeps the one it has); none when embeddings are off. */
async function turnsToEmbed(sessionId: string, texts: string[], options?: ChatIndexOptions): Promise<Set<string>> {
  if (options?.includeEmbeddings === false) return new Set();
  const embedded = new Set(await vectorDB.getEmbeddedChatTurns(sessionId));
  return new Set(texts.filter((text) => !embedded.has(text)));
}

/** Chunk → embed the new turns → upsert; content_hash is stamped only after the chunks are confirmed in the DB. */
async function indexSessionInternal(
  session: ChatSession,
  contentHash: string,
  options?: ChatIndexOptions,
): Promise<IndexingResult> {
  const chunks = chunkChatSession(session);

  // Always upsert session metadata so the DB count matches disk count
  await vectorDB.markChatIndexed({
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

  const newTexts = [...await turnsToEmbed(session.id, chunks.map((c) => c.text), options)];
  const vectors = new Map<string, number[]>();
  if (newTexts.length > 0) {
    try {
      (await embedDocuments(newTexts)).forEach((vector, i) => vectors.set(newTexts[i], vector));
    } catch (error) {
      if (!isEmbeddingMissing(error)) {
        console.error(`[ChatIndexer] Embedding failed for session "${session.title}":`, error);
      }
    }
  }

  const chunkDataList: ChatChunkData[] = chunks.map((chunk) => ({
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_type: chunk.type,
    embedding: vectors.get(chunk.text),
  }));

  await vectorDB.upsertChatChunks(session.id, chunkDataList);

  // Stamp content_hash AFTER chunks are confirmed — prevents hash poisoning on partial failure
  await vectorDB.markChatContentIndexed(session.id, contentHash);
  // Every turn has its vector (none new was needed, or all were made): the chat is embedded.
  if (options?.includeEmbeddings !== false && vectors.size === newTexts.length) {
    await vectorDB.markChatEmbedded(session.id);
  }

  console.log(`[ChatIndexer] Indexed session "${session.title}" (${chunks.length} turns)`);
  return {
    status: 'indexed',
    chunkCount: chunkDataList.length,
    embeddingCount: vectors.size,
  };
}

export const chatIndexer = {
  indexSession,
  indexAllSessions,
};
