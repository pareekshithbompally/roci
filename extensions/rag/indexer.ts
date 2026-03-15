/**
 * RAG Indexer
 *
 * Indexes meetings into the sqlite-vec vector store via the Rust backend.
 * Chunks transcripts, embeds each chunk, and upserts to the vectordb plugin.
 * Uses content hashing for staleness detection — only re-indexes changed meetings.
 */

import type { HistoryItem, AppSettings, MeetingSummary } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import { embeddingService } from './embeddings';
import { vectorDB } from './client';
import { graphDB } from './graph-client';
import { entityExtractor } from './entity-extractor';
import { chunkMeeting, computeContentHash } from './chunker';
import { emitProgress } from './progress';
import { EMBEDDING_MODEL } from './constants';
import type { ChunkData, MeetingMeta } from './client';
import type { RAGStatus } from './types';

export interface IndexOptions {
  signal?: AbortSignal;
  extractionContext?: {
    settings: AppSettings;
    providers: ModelProvider[];
  };
}

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

  // Embed all chunks in a single batch call
  const chunkTexts = chunks.map(c => c.text);
  let embeddings: number[][];
  try {
    embeddings = await embeddingService.embedBatch(chunkTexts);
  } catch (error) {
    console.error(`[RAGIndexer] Failed to embed chunks for "${item.title}":`, error);
    return false;
  }

  const chunkDataList: ChunkData[] = chunks.map((chunk, i) => ({
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_type: chunk.type,
    embedding: embeddings[i],
    start_pos: chunk.startPos ?? null,
    end_pos: chunk.endPos ?? null,
  }));

  if (chunkDataList.length === 0) {
    return false;
  }

  // Upsert all chunks + vectors atomically in the Rust backend
  await vectorDB.upsertChunks(item.id, chunkDataList);
  return true;
}

/**
 * Index all meetings that are new or stale (content changed since last index).
 * If extractionContext is provided, also re-extracts entities for stale meetings.
 * Returns the number of meetings indexed.
 */
async function indexAll(items: HistoryItem[], options?: AbortSignal | IndexOptions): Promise<number> {
  if (items.length === 0) return 0;

  // Support both old signature (signal) and new (IndexOptions)
  const signal = options instanceof AbortSignal ? options : options?.signal;
  const extractionContext = options instanceof AbortSignal ? undefined : options?.extractionContext;

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

  const staleSet = new Set(staleIds);
  const staleItems = items.filter((item) => staleSet.has(item.id));
  let indexed = 0;

  emitProgress({ kind: 'indexing', status: 'started', total: staleItems.length });

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
      const success = await indexMeeting(item);
      if (success) {
        indexed++;

        // Re-extract entities if we have settings/providers context
        if (extractionContext && item.structuredSummary) {
          const summary = toMeetingSummary(item.structuredSummary);
          entityExtractor.extractAndUpsert(
            item.id, item.title, summary, item.transcript,
            extractionContext.settings, extractionContext.providers,
          ).catch(err => console.error(`[RAGIndexer] Entity re-extraction failed for "${item.title}":`, err));
        }
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

  return indexed;
}

/** Convert StructuredSummary to MeetingSummary for entity extraction */
function toMeetingSummary(s: NonNullable<HistoryItem['structuredSummary']>): MeetingSummary {
  return {
    overview: s.overview || s.tldr || '',
    keyDiscussionPoints: s.keyDiscussionPoints || [],
    decisionsMade: s.decisionsMade || [],
    actionItems: (s.actionItems || []).map(a => ({
      text: a.text,
      owner: a.owner,
      dueDate: a.dueDate,
    })),
    nextSteps: s.nextSteps || [],
  };
}

/**
 * Remove a meeting and all its chunks/vectors.
 */
async function removeMeeting(meetingId: string): Promise<void> {
  await vectorDB.deleteMeeting(meetingId);
  await graphDB.deleteMeeting(meetingId).catch(err =>
    console.warn(`[RAGIndexer] Graph cleanup failed for ${meetingId}:`, err)
  );
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
  const staleSet = new Set(staleIds);
  return items.filter((item) => staleSet.has(item.id));
}

/**
 * Get current RAG system status (index stats, model state).
 */
export async function getRAGStatus(): Promise<RAGStatus> {
  const stats = await vectorDB.getStats();
  const meta = await vectorDB.getMeta();
  return {
    ready: stats.total_meetings > 0,
    indexedMeetings: Number(stats.total_meetings),
    totalChunks: Number(stats.total_chunks),
    dbSizeBytes: Number(stats.db_size_bytes),
    modelLoaded: embeddingService.isReady(),
    embeddingModel: meta.embedding_model || EMBEDDING_MODEL,
  };
}

export const ragIndexer = {
  indexMeeting,
  indexAll,
  removeMeeting,
  needsReindex,
};
