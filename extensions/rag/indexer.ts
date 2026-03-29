/**
 * RAG Indexer
 *
 * Indexes meetings into the sqlite-vec vector store via the Rust backend.
 * Chunks transcripts, embeds each chunk, and upserts to the vectordb plugin.
 * Uses content hashing for staleness detection — only re-indexes changed meetings.
 */

import type { HistoryItem, AppSettings, MeetingSummary } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import { embeddingService, preloadModel } from './embeddings';
import { vectorDB } from './client';
import { graphDB } from './graph-client';
import { entityExtractor } from './entity-extractor';
import { chunkMeeting, computeContentHash } from './chunker';
import { emitProgress } from './progress';
import { EMBEDDING_MODEL } from './constants';
import type { ChunkData, MeetingMeta } from './client';
import type { IndexingResult, RAGStatus } from './types';

export interface IndexOptions {
  signal?: AbortSignal;
  includeEmbeddings?: boolean;
  extractionContext?: {
    settings: AppSettings;
    providers: ModelProvider[];
  };
}

/**
 * Index a single meeting: chunk → embed → upsert to Rust backend.
 * content_hash is stamped ONLY after chunks are confirmed in DB.
 */
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
    timestamp: item.timestamp,
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
      embeddings = await embeddingService.embedBatch(chunkTexts);
    } catch (error) {
      console.error(`[RAGIndexer] Failed to embed chunks for "${item.title}":`, error);
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

  return {
    status: 'indexed',
    chunkCount: chunkDataList.length,
    embeddingCount: embeddings?.length ?? 0,
  };
}

/**
 * Index all meetings using multi-phase staleness tracking.
 *
 * Three independent concerns, each with its own completion tracking:
 *   Step 1: Content-stale meetings → chunk + FTS (+ embeddings if available)
 *   Step 2: Embedding-stale meetings → re-index with embeddings (content already fresh)
 *   Step 3: Extraction-stale meetings → extract KG entities
 *
 * Phase 1 (FTS-only) writes content_hash but NOT embedding_hash. Phase 2 finds
 * embedding_hash != content_hash and fills in embeddings. This eliminates the
 * single-hash poisoning bug where Phase 1 prevented Phase 2 from running.
 */
async function indexAll(items: HistoryItem[], options?: AbortSignal | IndexOptions): Promise<number> {
  if (items.length === 0) return 0;

  const signal = options instanceof AbortSignal ? options : options?.signal;
  const includeEmbeddings = options instanceof AbortSignal ? true : options?.includeEmbeddings ?? true;
  const extractionContext = options instanceof AbortSignal ? undefined : options?.extractionContext;

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

  // Compute content hashes for all items
  const hashes = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      content_hash: await computeContentHash(item),
    }))
  );

  let indexed = 0;

  // ── Step 1: Index content-stale meetings (chunks + FTS + optional embeddings) ──
  const staleIds = await vectorDB.getStaleMeetings(hashes);
  const staleSet = new Set(staleIds);
  const staleItems = items.filter((item) => staleSet.has(item.id));

  if (staleItems.length > 0) {
    emitProgress({ kind: 'indexing', status: 'started', total: staleItems.length, currentTitle: 'Loading embedding model…' });

    // Warm up embedding model before the loop so the first meeting
    // doesn't silently block on model download while the tray shows "1/N".
    if (includeEmbeddings) {
      try {
        await preloadModel();
      } catch {
        console.warn('[RAGIndexer] Embedding model preload failed — will retry per-meeting');
      }
    }

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
          // Mark embedding completion if embeddings were included and succeeded
          if (includeEmbeddings && result.embeddingCount > 0) {
            await vectorDB.markMeetingEmbedded(item.id);
          }
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
      emitProgress({ kind: 'embedding', status: 'started', total: embeddingItems.length });

      let embedded = 0;
      for (let i = 0; i < embeddingItems.length; i++) {
        if (signal?.aborted) break;

        const item = embeddingItems[i];
        emitProgress({
          kind: 'embedding',
          status: 'progress',
          current: i + 1,
          total: embeddingItems.length,
          currentTitle: item.title,
        });

        try {
          // Re-index with embeddings — re-does FTS (idempotent) but adds embeddings
          const result = await indexMeeting(item, { includeEmbeddings: true });
          if (result.status === 'indexed' && result.embeddingCount > 0) {
            await vectorDB.markMeetingEmbedded(item.id);
            embedded++;
          }
        } catch (error) {
          console.error(`[RAGIndexer] Embedding upgrade failed for "${item.title}":`, error);
        }
      }

      emitProgress({
        kind: 'embedding',
        status: 'complete',
        current: embedded,
        total: embeddingItems.length,
      });

      if (embedded > 0) {
        console.log(`[RAGIndexer] Embedded ${embedded} meetings`);
      }
    }
  }

  // ── Step 3: Entity extraction for extraction-stale meetings ──
  if (extractionContext) {
    const extractable = items.filter(item => item.structuredSummary);
    if (extractable.length === 0) {
      console.log('[RAGIndexer] Step 3 skipped: no meetings have structuredSummary');
    } else {
      const extractableIds = extractable.map(i => i.id);
      const needsExtractionIds = await vectorDB.getMeetingsNeedingExtraction(extractableIds);

      if (needsExtractionIds.length === 0) {
        console.log('[RAGIndexer] Step 3 skipped: all meetings already extracted');
      } else {
        const needsExtractionSet = new Set(needsExtractionIds);
        const extractionItems = extractable.filter(i => needsExtractionSet.has(i.id));

        console.log(`[RAGIndexer] Step 3: extracting entities for ${extractionItems.length} meetings`);
        emitProgress({ kind: 'extraction', status: 'started', total: extractionItems.length });

        let extracted = 0;
        for (let i = 0; i < extractionItems.length; i++) {
          if (signal?.aborted) break;
          const item = extractionItems[i];

          emitProgress({
            kind: 'extraction',
            status: 'progress',
            current: i + 1,
            total: extractionItems.length,
            currentTitle: item.title,
          });

          try {
            const summary = toMeetingSummary(item.structuredSummary!);
            const success = await entityExtractor.extractAndUpsert(
              item.id, item.title, summary, item.transcript,
              extractionContext.settings, extractionContext.providers,
              item.categories || [],
              signal,
            );
            if (success) {
              await vectorDB.markMeetingExtracted(item.id);
              extracted++;
            }
          } catch (err) {
            console.error(`[RAGIndexer] Entity extraction failed for "${item.title}":`, err);
          }
        }

        emitProgress({
          kind: 'extraction',
          status: 'complete',
          current: extracted,
          total: extractionItems.length,
        });

        console.log(`[RAGIndexer] Step 3 complete: extracted ${extracted}/${extractionItems.length} meetings`);
      }
    }
  } else {
    console.log('[RAGIndexer] Step 3 skipped: no extractionContext (chatModel not configured)');
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

/**
 * Run ONLY the KG entity extraction step for extraction-stale meetings.
 * Does NOT re-chunk or re-embed — assumes meetings are already indexed.
 */
async function extractAll(
  items: HistoryItem[],
  extractionContext: { settings: AppSettings; providers: ModelProvider[] },
  signal?: AbortSignal,
): Promise<number> {
  await vectorDB.initialize();

  const extractable = items.filter(item => item.structuredSummary);
  if (extractable.length === 0) {
    console.log('[RAGIndexer] extractAll: no meetings have structuredSummary');
    return 0;
  }

  const extractableIds = extractable.map(i => i.id);
  const needsExtractionIds = await vectorDB.getMeetingsNeedingExtraction(extractableIds);

  if (needsExtractionIds.length === 0) {
    console.log('[RAGIndexer] extractAll: all meetings already extracted');
    return 0;
  }

  const needsExtractionSet = new Set(needsExtractionIds);
  const extractionItems = extractable.filter(i => needsExtractionSet.has(i.id));

  console.log(`[RAGIndexer] extractAll: ${extractionItems.length} meetings need entity extraction`);
  emitProgress({ kind: 'extraction', status: 'started', total: extractionItems.length });

  let extracted = 0;
  for (let i = 0; i < extractionItems.length; i++) {
    if (signal?.aborted) break;
    const item = extractionItems[i];

    emitProgress({
      kind: 'extraction',
      status: 'progress',
      current: i + 1,
      total: extractionItems.length,
      currentTitle: item.title,
    });

    try {
      const summary = toMeetingSummary(item.structuredSummary!);
      const success = await entityExtractor.extractAndUpsert(
        item.id, item.title, summary, item.transcript,
        extractionContext.settings, extractionContext.providers,
        item.categories || [],
        signal,
      );
      if (success) {
        await vectorDB.markMeetingExtracted(item.id);
        extracted++;
      }
    } catch (err) {
      console.error(`[RAGIndexer] Entity extraction failed for "${item.title}":`, err);
    }
  }

  emitProgress({
    kind: 'extraction',
    status: 'complete',
    current: extracted,
    total: extractionItems.length,
  });

  console.log(`[RAGIndexer] extractAll complete: ${extracted}/${extractionItems.length} meetings`);
  return extracted;
}

export const ragIndexer = {
  indexMeeting,
  indexAll,
  extractAll,
  removeMeeting,
  needsReindex,
};
