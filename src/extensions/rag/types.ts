export interface EmbeddingService {
  embed(text: string, opts?: { interactive?: boolean }): Promise<number[]>;
  embedBatch(texts: string[], opts?: { interactive?: boolean }): Promise<number[][]>;
  isReady(): boolean;
}

/** Denial code for silent (non-interactive) load attempts without consent. */
export const NOT_CONSENTED = 'NOT_CONSENTED';

export interface SearchOptions {
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
  /** Scope search to specific meetings — returns multiple chunks per meeting */
  meetingIds?: string[];
}

export interface RAGStatus {
  ready: boolean;
  indexedMeetings: number;
  totalChunks: number;
  dbSizeBytes: number;
  modelLoaded: boolean;
  embeddingModel: string;
}

export interface IndexingResult {
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  embeddingCount: number;
  reason?: string;
}
