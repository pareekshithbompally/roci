/** Indexes meetings into sqlite-vec via Rust: chunk, embed, upsert; content hashes skip unchanged meetings. */

import type { HistoryItem } from '@shared/types';
import { embedDocuments, isEmbeddingMissing } from './embeddings';
import { vectorDB } from './client';
import { chunkMeeting, computeContentHash } from './chunker';
import { emitProgress } from './progress';
import { HASH_CONCURRENCY } from './constants';
import { concurrencyMap } from '@shared/utils/async.utils';
import type { ChunkData, MeetingMeta } from './client';
import type { IndexingResult } from './types';

export interface IndexOptions {
  signal?: AbortSignal;
  includeEmbeddings?: boolean;
  /** Skip staleness check and re-index everything (for manual re-index) */
  force?: boolean;
}

/** Chunk → embed → upsert; content_hash is stamped only after the chunks are confirmed in the DB, embedded once vectors are in. */
async function indexMeeting(
  item: HistoryItem,
  options?: Pick<IndexOptions, 'includeEmbeddings'>,
): Promise<IndexingResult> {
  const contentHash = await computeContentHash(item);
  const chunks = chunkMeeting(item);

  // Always upsert meeting metadata so the DB count matches disk count
  const meetingMeta: MeetingMeta = {
    id: item.id,
    title: item.title,
    created_at: item.timestamp,
    summary: item.summary || null,
    categories: (item.categories || []).join(', ') || null,
  };
  await vectorDB.upsertMeeting(meetingMeta);

  if (chunks.length === 0) {
    // Stamp content_hash so this meeting isn't perpetually stale
    await vectorDB.markMeetingContentIndexed(item.id, contentHash);
    console.warn(`[RAGIndexer] No chunks generated for "${item.title}" (metadata registered)`);
    return { status: 'skipped', reason: 'no_chunks', chunkCount: 0, embeddingCount: 0 };
  }

  // Embed all chunks in a single batch call
  const chunkTexts = chunks.map(c => c.text);
  let embeddings: number[][] | null = null;
  if (options?.includeEmbeddings !== false) {
    try {
      embeddings = await embedDocuments(chunkTexts);
    } catch (error) {
      if (!isEmbeddingMissing(error)) {
        console.error(`[RAGIndexer] Failed to embed chunks for "${item.title}":`, error);
      }
    }
  }

  const chunkDataList: ChunkData[] = chunks.map((chunk, i) => ({
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_type: chunk.type,
    embedding: embeddings?.[i],
    start_pos: chunk.startPos ?? null,
    end_pos: chunk.endPos ?? null,
  }));

  if (chunkDataList.length === 0) {
    return { status: 'skipped', reason: 'no_chunk_data', chunkCount: 0, embeddingCount: 0 };
  }

  // Upsert all chunks + vectors atomically in the Rust backend
  await vectorDB.upsertChunks(item.id, chunkDataList);

  // Stamp content_hash AFTER chunks are confirmed — prevents hash poisoning on partial failure
  await vectorDB.markMeetingContentIndexed(item.id, contentHash);
  if (embeddings && embeddings.length > 0) await vectorDB.markMeetingEmbedded(item.id);

  return {
    status: 'indexed',
    chunkCount: chunkDataList.length,
    embeddingCount: embeddings?.length ?? 0,
  };
}

/** Content and embedding staleness are tracked separately, so FTS-only runs never block embedding. */
async function indexAll(items: HistoryItem[], options?: AbortSignal | IndexOptions): Promise<number> {
  if (items.length === 0) return 0;

  const signal = options instanceof AbortSignal ? options : options?.signal;
  const includeEmbeddings = options instanceof AbortSignal ? true : options?.includeEmbeddings ?? true;
  const force = options instanceof AbortSignal ? false : options?.force ?? false;

  await vectorDB.initialize();

  // Auto-heal: detect empty FTS5 with non-empty chunks (caused by prior hash-poisoning bug)
  try {
    const stats = await vectorDB.getStats();
    if (
      (stats.total_chunks > 0 && stats.fts_chunks === 0) ||
      (stats.chat_chunks > 0 && stats.fts_chat_chunks === 0)
    ) {
      console.warn('[RAGIndexer] FTS5 index empty but chunks exist — rebuilding FTS indexes');
      await vectorDB.rebuildFts();
    }
  } catch (error) {
    console.error('[RAGIndexer] FTS recovery check failed:', error);
  }

  // Compute content hashes with bounded concurrency (avoids memory spike for large libraries)
  const hashes = await concurrencyMap(
    items,
    async (item) => ({
      id: item.id,
      content_hash: await computeContentHash(item),
    }),
    { limit: HASH_CONCURRENCY, signal },
  );

  let indexed = 0;

  // ── Step 1: Index content-stale meetings (chunks + FTS + optional embeddings) ──
  let staleItems: HistoryItem[];
  if (force) {
    staleItems = items;
    console.log(`[RAGIndexer] Force re-index: processing all ${items.length} meetings`);
  } else {
    const staleIds = await vectorDB.getStaleMeetings(hashes);
    const staleSet = new Set(staleIds);
    staleItems = items.filter((item) => staleSet.has(item.id));
  }

  if (staleItems.length > 0) {
    emitProgress({ kind: 'indexing', status: 'started', total: staleItems.length, currentTitle: 'Indexing…' });

    for (let i = 0; i < staleItems.length; i++) {
      if (signal?.aborted) break;

      const item = staleItems[i];
      emitProgress({
        kind: 'indexing',
        status: 'progress',
        current: i + 1,
        total: staleItems.length,
        currentTitle: item.title,
      });

      console.log(`[RAGIndexer] Indexing ${i + 1}/${staleItems.length}: ${item.title}`);

      try {
        const result = await indexMeeting(item, { includeEmbeddings });
        if (result.status === 'indexed') {
          indexed++;
        } else if (result.status === 'failed') {
          console.warn(`[RAGIndexer] Indexing failed for "${item.title}": ${result.reason ?? 'unknown'}`);
        }
      } catch (error) {
        console.error(`[RAGIndexer] Failed to index "${item.title}":`, error);
      }
    }

    emitProgress({
      kind: 'indexing',
      status: 'complete',
      current: indexed,
      total: staleItems.length,
    });

    if (indexed > 0) {
      const stats = await vectorDB.getStats();
      console.log(
        `[RAGIndexer] Indexed ${indexed} meetings (${stats.total_meetings} total, ${stats.total_chunks} chunks)`
      );
    }
  }

  // ── Step 2: Upgrade embedding-stale meetings (content-fresh but embeddings missing) ──
  if (includeEmbeddings) {
    const allIds = items.map(i => i.id);
    const needsEmbeddingIds = await vectorDB.getMeetingsNeedingEmbeddings(allIds);

    if (needsEmbeddingIds.length > 0) {
      const needsEmbeddingSet = new Set(needsEmbeddingIds);
      const embeddingItems = items.filter(i => needsEmbeddingSet.has(i.id));

      console.log(`[RAGIndexer] ${embeddingItems.length} meetings need embedding upgrade`);
      emitProgress({ kind: 'indexing', status: 'started', total: embeddingItems.length, currentTitle: 'Adding embeddings…' });

      let embedded = 0;
      for (let i = 0; i < embeddingItems.length; i++) {
        if (signal?.aborted) break;

        const item = embeddingItems[i];
        emitProgress({
          kind: 'indexing',
          status: 'progress',
          current: i + 1,
          total: embeddingItems.length,
          currentTitle: item.title,
        });

        try {
          // Re-index with embeddings — re-does FTS (idempotent) but adds embeddings
          const result = await indexMeeting(item, { includeEmbeddings: true });
          if (result.status === 'indexed' && result.embeddingCount > 0) embedded++;
        } catch (error) {
          console.error(`[RAGIndexer] Embedding upgrade failed for "${item.title}":`, error);
        }
      }

      emitProgress({
        kind: 'indexing',
        status: 'complete',
        current: embedded,
        total: embeddingItems.length,
      });

      if (embedded > 0) {
        console.log(`[RAGIndexer] Embedded ${embedded} meetings`);
      }
    }
  }

  return indexed;
}

/** Items that are new or stale. */
async function needsReindex(items: HistoryItem[]): Promise<HistoryItem[]> {
  if (items.length === 0) return [];

  const hashes = await concurrencyMap(
    items,
    async (item) => ({
      id: item.id,
      content_hash: await computeContentHash(item),
    }),
    { limit: HASH_CONCURRENCY },
  );

  const staleIds = await vectorDB.getStaleMeetings(hashes);
  const staleSet = new Set(staleIds);
  return items.filter((item) => staleSet.has(item.id));
}

export const ragIndexer = {
  indexMeeting,
  indexAll,
  needsReindex,
};
