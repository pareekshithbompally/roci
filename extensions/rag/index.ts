export * from './types';
export { embeddingService, preloadModel, resetPipeline } from './embeddings';
export { vectorDB } from './client';
export { ragIndexer, getRAGStatus } from './indexer';
export { ragSearcher } from './searcher';
export { chunkMeeting, computeContentHash } from './chunker';
export { onConsentNeeded, hasConsent, revokeConsent } from './consent';
export { onRAGProgress, onEmbeddingProgress, emitProgress } from './progress';
export type { RAGProgressEvent, EmbeddingModelEvent, IndexingProgressEvent, ExtractionProgressEvent, EmbeddingUpgradeProgressEvent, EmbeddingProgress } from './progress';
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
export { graphDB } from './graph-client';
export { entityExtractor } from './entity-extractor';
export { ENTITY_TYPES, RELATIONSHIP_TYPES } from './graph-types';
export type {
  GraphNode, GraphEdge, GraphUpsertPayload,
  TraversalParams, TraversalResult,
  GraphSearchParams, GraphStats,
  EntityType, RelationshipType,
} from './graph-types';
export { chatIndexer } from './chat-indexer';
export { chatSearcher } from './chat-searcher';
export type { ChatSearchResult } from './chat-searcher';
