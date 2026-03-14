/**
 * RAG Indexer
 *
 * Indexes meetings into the sqlite-vec vector store via the Rust backend.
 * Chunks transcripts, embeds each chunk, and upserts to the vectordb plugin.
 * Uses content hashing for staleness detection — only re-indexes changed meetings.
 */

import type { HistoryItem } from '@/types';
import { embeddingService } from './embeddings';
import { vectorDB } from './client';
import { chunkMeeting, computeContentHash } from './chunker';
import type { ChunkData, MeetingMeta } from './client';

/**
 * Index a single meeting: chunk → embed → upsert to Rust backend.
 */
async function indexMeeting(item: HistoryItem): Promise<boolean> {
  const contentHash = await computeContentHash(item);
  const chunks = chunkMeeting(item);

  if (chunks.length === 0) {
    console.warn(`[RAGIndexer] No chunks generated for "${item.title}"`);
    return false;
  }

  // Upsert meeting metadata
  const meetingMeta: MeetingMeta = {
    id: item.id,
    title: item.title,
    timestamp: item.timestamp,
    summary: item.summary || null,
    categories: (item.categories || []).join(', ') || null,
    content_hash: contentHash,
  };
  await vectorDB.upsertMeeting(meetingMeta);

  // Embed all chunks
  const chunkDataList: ChunkData[] = [];
  for (const chunk of chunks) {
    let embedding: number[];
    try {
      embedding = await embeddingService.embed(chunk.text);
    } catch (error) {
      console.error(`[RAGIndexer] Failed to embed chunk ${chunk.index} of "${item.title}":`, error);
      continue;
    }

    chunkDataList.push({
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      chunk_type: chunk.type,
      embedding,
      start_pos: chunk.startPos ?? null,
      end_pos: chunk.endPos ?? null,
    });
  }

  if (chunkDataList.length === 0) {
    return false;
  }

  // Upsert all chunks + vectors atomically in the Rust backend
  await vectorDB.upsertChunks(item.id, chunkDataList);
  return true;
}

/**
 * Index all meetings that are new or stale (content changed since last index).
 * Returns the number of meetings indexed.
 */
async function indexAll(items: HistoryItem[]): Promise<number> {
  if (items.length === 0) return 0;

  await vectorDB.initialize();

  // Compute content hashes for all items
  const hashes = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      content_hash: await computeContentHash(item),
    }))
  );

  // Ask the Rust backend which meetings are stale or missing
  const staleIds = await vectorDB.getStaleMeetings(hashes);
  if (staleIds.length === 0) {
    return 0;
  }

  const staleItems = items.filter((item) => staleIds.includes(item.id));
  let indexed = 0;

  for (let i = 0; i < staleItems.length; i++) {
    const item = staleItems[i];

    console.log(`[RAGIndexer] Indexing ${i + 1}/${staleItems.length}: ${item.title}`);

    try {
      const success = await indexMeeting(item);
      if (success) indexed++;
    } catch (error) {
      console.error(`[RAGIndexer] Failed to index "${item.title}":`, error);
    }
  }

  if (indexed > 0) {
    const stats = await vectorDB.getStats();
    console.log(
      `[RAGIndexer] Indexed ${indexed} meetings (${stats.total_meetings} total, ${stats.total_chunks} chunks)`
    );
  }

  return indexed;
}

/**
 * Remove a meeting and all its chunks/vectors.
 */
async function removeMeeting(meetingId: string): Promise<void> {
  await vectorDB.deleteMeeting(meetingId);
  console.log(`[RAGIndexer] Removed meeting ${meetingId}`);
}

/**
 * Check if any items need indexing (new or stale).
 */
async function needsReindex(items: HistoryItem[]): Promise<HistoryItem[]> {
  if (items.length === 0) return [];

  const hashes = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      content_hash: await computeContentHash(item),
    }))
  );

  const staleIds = await vectorDB.getStaleMeetings(hashes);
  return items.filter((item) => staleIds.includes(item.id));
}

export const ragIndexer = {
  indexMeeting,
  indexAll,
  removeMeeting,
  needsReindex,
};
