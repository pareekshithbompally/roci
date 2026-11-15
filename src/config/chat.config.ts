/** Chat UI and session management constants. */

/** Number of session index entries to show per page in the sidebar */
export const CHAT_PAGE_SIZE = 50;

/** Number of items to show initially in the unified sidebar. More load on scroll. */
export const SIDEBAR_PAGE_SIZE = 25;

/** Max fully loaded ChatSessions in the LRU cache; the oldest (never the current one) is evicted. */
export const MAX_LOADED_SESSIONS = 10;

/** Debounce delay (ms) for sidebar title search filtering */
export const SIDEBAR_SEARCH_DEBOUNCE_MS = 200;

/** Spotlight search debounce (ms), short because the search runs in the local Rust backend. */
export const SPOTLIGHT_DEBOUNCE_MS = 150;

/** Minimum query length for content search; 1-char queries scan the whole dictionary. */
export const SPOTLIGHT_MIN_QUERY_LENGTH = 2;

/** Max results per source type returned by spotlight_search. */
export const SPOTLIGHT_RESULTS_PER_SOURCE = 6;

/** What a reply's header says before its first word, in the order it's checked. */
export const CHAT_LOADING_COPY = {
  'loading-weights': 'Loading weights',
  'loading-draft': 'Loading draft',
  'loading-projector': 'Loading projector',
  'reading-prompt': 'Reading your message',
  thinking: 'Thinking…',
  searching: 'Searching the web…',
  working: 'Working on it…',
} as const;

/** The detail beside the reply header's status, from what a local server reports. */
export const CHAT_LOADING_DETAIL = {
  secondsLeft: (seconds: number) => `${seconds}s left`,
  generation: (tokens: number, tokensPerSecond: number) => `${tokens} tokens · ${tokensPerSecond.toFixed(1)} tok/s`,
} as const;
