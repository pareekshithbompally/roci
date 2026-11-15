export * from './types';
export { embeddingService, preloadModel, resetPipeline, isEmbeddingReady } from './embeddings';
export { vectorDB } from './client';
export { ragIndexer, getRAGStatus } from './indexer';
export { ragSearcher } from './searcher';
export { chunkMeeting, computeContentHash } from './chunker';
export { hasConsent, grantConsent } from './consent';
export { onRAGProgress, onEmbeddingProgress, emitProgress } from './progress';
export type { RAGProgressEvent, EmbeddingModelEvent, IndexingProgressEvent, EmbeddingProgress } from './progress';
export type { MeetingSearchResult } from './searcher';
export type { Chunk } from './chunker';
export type { IndexingResult } from './types';
export type {
  MeetingMeta,
  ChunkData,
  SearchParams,
  SearchHit,
  MeetingHash,
  DbStats,
  DbMeta,
} from './client';
export { chatIndexer } from './chat-indexer';
export { chatSearcher } from './chat-searcher';
export type { ChatSearchResult } from './chat-searcher';
