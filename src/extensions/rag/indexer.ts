/** Indexes meetings into sqlite-vec via Rust: chunk, embed, upsert; content hashes skip unchanged meetings. */

import type { HistoryItem } from '@shared/types';
import { embedDocuments, isEmbeddingMissing, newVectors } from './embeddings';
import { vectorDB } from './client';
import { chunkMeeting, chunkTranscript, computeContentHash, type Chunk } from './chunker';
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

/** Statuses before a meeting's transcript is saved: its index then holds only the stretches appended while it recorded,
 *  which indexing from saved content would wipe. */
const WAITING_FOR_TRANSCRIPT = new Set(['recording', 'captured', 'transcribing']);

/** Whether a meeting is indexed from its saved content: once its transcript is in, or it ended without one. The one rule for
 *  every path (app start, Settings, the chat's search tool, a single meeting). */
export const isIndexable = (item: HistoryItem): boolean => !item.status || !WAITING_FOR_TRANSCRIPT.has(item.status.status);

/** The chunks' vectors in one batch, or null without the embedding model (full-text search still finds them). */
async function embedChunks(chunks: Chunk[], label: string): Promise<number[][] | null> {
  try {
    return await embedDocuments(chunks.map((c) => c.text));
  } catch (error) {
    if (!isEmbeddingMissing(error)) console.error(`[RAGIndexer] Failed to embed chunks for "${label}":`, error);
    return null;
  }
}

/** Chunks as the store keeps them, with their vectors when there are any. */
function chunkRows(chunks: Chunk[], vectorOf: (chunk: Chunk, i: number) => number[] | undefined): ChunkData[] {
  return chunks.map((chunk, i) => ({
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_type: chunk.type,
    embedding: vectorOf(chunk, i),
    start_pos: chunk.startPos ?? null,
    end_pos: chunk.endPos ?? null,
  }));
}

/** A stretch of a meeting's transcript while it records: chunked and embedded as the whole meeting is, added after what is
 *  indexed (the final transcript's indexing keeps the pieces whose text it shares). Resolves the chunk texts it added. */
async function appendTranscript(meetingId: string, stretch: string): Promise<string[]> {
  const chunks = chunkTranscript(stretch);
  if (chunks.length === 0) return [];
  const vectors = await embedChunks(chunks, meetingId);
  await vectorDB.appendChunks(meetingId, chunkRows(chunks, (_, i) => vectors?.[i]));
  return chunks.map((c) => c.text);
}

/** Chunk → embed → upsert; content_hash is stamped only after the chunks are confirmed in the DB, embedded once vectors are in. */
async function indexMeeting(
  item: HistoryItem,
  options?: Pick<IndexOptions, 'includeEmbeddings'>,
): Promise<IndexingResult> {
  if (!isIndexable(item)) return { status: 'skipped', reason: 'waiting_for_transcript', chunkCount: 0, embeddingCount: 0 };
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

  const { vectors, complete } = await newVectors('meeting', item.id, chunks.map((c) => c.text), options?.includeEmbeddings !== false);
  const chunkDataList = chunkRows(chunks, (chunk) => vectors.get(chunk.text));

  if (chunkDataList.length === 0) {
    return { status: 'skipped', reason: 'no_chunk_data', chunkCount: 0, embeddingCount: 0 };
  }

  // Upsert all chunks + vectors atomically in the Rust backend
  await vectorDB.upsertChunks(item.id, chunkDataList);

  // Stamp content_hash AFTER chunks are confirmed — prevents hash poisoning on partial failure
  await vectorDB.markMeetingContentIndexed(item.id, contentHash);
  if (complete) await vectorDB.markMeetingEmbedded(item.id);

  return {
    status: 'indexed',
    chunkCount: chunkDataList.length,
    embeddingCount: vectors.size,
  };
}

/** Content and embedding staleness are tracked separately, so FTS-only runs never block embedding. */
async function indexAll(all: HistoryItem[], options?: AbortSignal | IndexOptions): Promise<number> {
  const items = all.filter(isIndexable);
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

export const ragIndexer = {
  indexMeeting,
  appendTranscript,
  indexAll,
};
