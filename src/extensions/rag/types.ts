export interface SearchOptions {
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
  /** Scope search to specific meetings — returns multiple chunks per meeting */
  meetingIds?: string[];
}

export interface IndexingResult {
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  embeddingCount: number;
  reason?: string;
}
