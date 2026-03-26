/**
 * RAG Constants
 *
 * Single source of truth for all configurable RAG parameters.
 * Import from here — never hardcode these values in other files.
 */

// ── Chunking ──
export const MAX_CHUNK_CHARS = 2000;
export const OVERLAP_CHARS = 200;
/** Minimum character length for notes chunk to be worth indexing */
export const MIN_NOTES_LENGTH = 20;

// ── Embedding ──
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;
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

// ── Consent ──
/** Timeout for consent modal response (ms) */
export const CONSENT_TIMEOUT_MS = 60_000;

// ── Indexing ──
/** How long to debounce before showing indexing toast (ms) */
export const INDEXING_TOAST_DEBOUNCE_MS = 1000;

// ── Chat Indexing ──

/** Minimum character length for a chat turn to be worth indexing.
 *  Turns shorter than this (e.g., "ok", "thanks") are skipped. */
export const MIN_TURN_LENGTH = 30;

/** Maximum characters from an assistant message to include in a turn chunk.
 *  Long AI responses are capped to keep chunk size manageable for embedding. */
export const MAX_ASSISTANT_CHUNK_CHARS = 1000;

/** Default number of chat search results to return */
export const DEFAULT_CHAT_SEARCH_LIMIT = 5;
