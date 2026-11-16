/** Event bridge so the non-React embedder and indexers report model and indexing progress to the UI. */

/** Embedding model lifecycle events */
export interface EmbeddingModelEvent {
  kind: 'model';
  status: 'downloading' | 'loading' | 'ready' | 'error';
  /** Bytes loaded so far */
  loaded?: number;
  /** Total bytes expected */
  total?: number;
  /** 0-100 percentage */
  percent?: number;
  /** Error message if status === 'error' */
  error?: string;
}

/** Meeting/chat indexing progress events */
export interface IndexingProgressEvent {
  kind: 'indexing';
  status: 'started' | 'progress' | 'complete' | 'error';
  /** Current item being indexed (1-based) */
  current?: number;
  /** Total items to index */
  total?: number;
  /** Title of current item */
  currentTitle?: string;
  error?: string;
}

export type RAGProgressEvent = EmbeddingModelEvent | IndexingProgressEvent;


type ProgressListener = (event: RAGProgressEvent) => void;

let listener: ProgressListener | null = null;

/** Called by embeddings.ts and indexer.ts to emit progress events */
export function emitProgress(event: RAGProgressEvent): void {
  listener?.(event);
}

/** Subscribes to all RAG progress events; returns an unsubscribe function. */
export function onRAGProgress(cb: ProgressListener): () => void {
  listener = cb;
  return () => { listener = null; };
}
