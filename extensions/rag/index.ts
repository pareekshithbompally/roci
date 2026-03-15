export * from './types';
export { embeddingService, preloadModel, resetPipeline } from './embeddings';
export { vectorDB } from './client';
export { ragIndexer, getRAGStatus } from './indexer';
export { ragSearcher } from './searcher';
export { chunkMeeting, computeContentHash } from './chunker';
export { onConsentNeeded, hasConsent, revokeConsent } from './consent';
export { onRAGProgress, onEmbeddingProgress } from './progress';
export type { RAGProgressEvent, EmbeddingModelEvent, IndexingProgressEvent, EmbeddingProgress } from './progress';
export type { MeetingSearchResult } from './searcher';
export type { Chunk } from './chunker';
export type {
  MeetingMeta,
  ChunkData,
  SearchParams,
  SearchHit,
  MeetingHash,
  DbStats,
  DbMeta,
} from './client';
