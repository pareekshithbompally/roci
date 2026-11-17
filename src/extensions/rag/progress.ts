/** Event bridge so the non-React indexers report indexing progress to the UI. */

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

export type RAGProgressEvent = IndexingProgressEvent;


type ProgressListener = (event: RAGProgressEvent) => void;

let listener: ProgressListener | null = null;

/** Called by the indexers to emit progress events */
export function emitProgress(event: RAGProgressEvent): void {
  listener?.(event);
}

/** Subscribes to all RAG progress events; returns an unsubscribe function. */
export function onRAGProgress(cb: ProgressListener): () => void {
  listener = cb;
  return () => { listener = null; };
}
