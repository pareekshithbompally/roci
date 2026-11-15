/**
 * Chat Configuration
 * Single source of truth for chat UI and session management constants.
 */

/** Number of session index entries to show per page in the sidebar */
export const CHAT_PAGE_SIZE = 50;

/** Number of items to show initially in the unified sidebar. More load on scroll. */
export const SIDEBAR_PAGE_SIZE = 25;

/** Maximum number of fully-loaded ChatSession objects to hold in the LRU cache.
 *  Oldest session is evicted when this limit is exceeded (excluding currentSessionId). */
export const MAX_LOADED_SESSIONS = 10;

/** Debounce delay (ms) for sidebar title search filtering */
export const SIDEBAR_SEARCH_DEBOUNCE_MS = 200;

/** Debounce delay (ms) before firing a spotlight search query.
 *  150ms is appropriate for local Rust backend (no network latency).
 *  300ms would feel sluggish; 50ms would fire on every keystroke. */
export const SPOTLIGHT_DEBOUNCE_MS = 150;

/** Minimum query length to trigger a content search.
 *  1-char queries scan the entire dictionary (slow). 2 chars + prefix='2 3' is fast. */
export const SPOTLIGHT_MIN_QUERY_LENGTH = 2;

/** Max results per source type returned by spotlight_search. */
export const SPOTLIGHT_RESULTS_PER_SOURCE = 6;

/** What a reply's header says before its first word, in the order it's checked. */
export const CHAT_LOADING_COPY = {
  'loading-model': 'Loading model…',
  'reading-prompt': 'Reading your message…',
  searching: 'Searching the web…',
  working: 'Working on it…',
} as const;
