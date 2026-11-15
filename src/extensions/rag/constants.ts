/** Configurable RAG parameters. */

// ── Chunking ──
export const MAX_CHUNK_CHARS = 2000;
export const OVERLAP_CHARS = 200;
/** Minimum character length for notes chunk to be worth indexing */
export const MIN_NOTES_LENGTH = 20;

// ── Concurrency ──
/** Max concurrent SHA-256 hash computations (bounds memory for large libraries) */
export const HASH_CONCURRENCY = 10;
/** Max concurrent file I/O operations (prevents descriptor exhaustion) */
export const IO_CONCURRENCY = 5;

// ── Embedding ──
export const EMBEDDING_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
export const EMBEDDING_DIM = 768;
export const EMBEDDING_DTYPE = 'q8';
/** Max texts to embed in a single batch call */
export const EMBEDDING_BATCH_SIZE = 8;

// ── Search Scoring ──
/** RRF score threshold for "high confidence" results */
export const SCORE_HIGH = 0.025;
/** RRF score threshold for "medium confidence" results */
export const SCORE_MEDIUM = 0.012;
/** Default number of search results */
export const DEFAULT_SEARCH_LIMIT = 5;

// ── Indexing ──
/** How long to debounce before showing indexing toast (ms) */
export const INDEXING_TOAST_DEBOUNCE_MS = 1000;

// ── Chat Indexing ──

/** Chat turns shorter than this ("ok", "thanks") are not indexed. */
export const MIN_TURN_LENGTH = 30;

/** Cap on assistant text per turn chunk, to keep chunks a manageable size to embed. */
export const MAX_ASSISTANT_CHUNK_CHARS = 1000;

/** Default number of chat search results to return */
export const DEFAULT_CHAT_SEARCH_LIMIT = 5;
