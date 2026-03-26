export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isReady(): boolean;
}

export interface SearchOptions {
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
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
