/**
 * RAG Embedding Model Progress Bridge
 *
 * Event-based bridge (same pattern as consent.ts) so the non-React
 * embedding service can report download/load progress to the React modal.
 */

export interface EmbeddingProgress {
  status: 'downloading' | 'loading' | 'ready' | 'error';
  /** File currently being downloaded (Transformers.js downloads multiple shards) */
  file?: string;
  /** Bytes loaded so far */
  loaded?: number;
  /** Total bytes expected */
  total?: number;
  /** 0-100 percentage */
  percent?: number;
  /** Error message if status === 'error' */
  error?: string;
}

type ProgressListener = (progress: EmbeddingProgress) => void;

let listener: ProgressListener | null = null;

/** Called by embeddings.ts to emit progress events */
export function emitProgress(progress: EmbeddingProgress): void {
  listener?.(progress);
}

/**
 * Called by ModelDownloadModal to subscribe to progress events.
 * Returns an unsubscribe function.
 */
export function onEmbeddingProgress(cb: ProgressListener): () => void {
  listener = cb;
  return () => { listener = null; };
}
