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
/** The on-device model (Rust catalog id) that embeds meetings and chats; its vectors are 1024-d. */
export const EMBEDDING_MODEL_ID = 'qwen3-embedding-0.6b';
/** Qwen3 Embedding's retrieval prompts: a query carries the task instruction, documents go in as they are. */
export const EMBEDDING_PREFIX = {
  query: 'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:',
  document: '',
} as const;
/** Texts per embedding request. */
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
/** A finished meeting's notes or to-dos re-index this long after the last edit (ms), so typing indexes once. */
export const MEETING_EDIT_SETTLE_MS = 2000;

// ── Chat Indexing ──

/** Chat turns shorter than this ("ok", "thanks") are not indexed. */
export const MIN_TURN_LENGTH = 30;

/** Cap on assistant text per turn chunk, to keep chunks a manageable size to embed. */
export const MAX_ASSISTANT_CHUNK_CHARS = 1000;

/** Default number of chat search results to return */
export const DEFAULT_CHAT_SEARCH_LIMIT = 5;
