/** Chat UI and session management constants. */

import type { ReasoningEffort } from '@shared/types';

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

/** A tool row keeps this much of a tool's output for its expanded view. */
export const TOOL_RESULT_PREVIEW_CHARS = 500;

/** What a reply's header says before its first word, in the order it's checked. */
export const CHAT_LOADING_COPY = {
  'loading-weights': 'Loading weights',
  'loading-draft': 'Loading draft',
  'loading-projector': 'Loading projector',
  'reading-prompt': 'Reading your message',
  working: 'Working on it…',
} as const;

/** The detail beside the reply header's status, from what a local server reports. */
export const CHAT_LOADING_DETAIL = {
  secondsLeft: (seconds: number) => `${seconds}s left`,
} as const;

/** The reply's thinking block and the composer's thinking control. */
export const CHAT_REASONING_COPY = {
  control: 'Thinking',
  thinking: 'Thinking…',
  done: 'Thinking',
  tokens: (count: number) => `${count} tokens`,
  speed: (tokensPerSecond: number) => `${tokensPerSecond.toFixed(1)} tok/s`,
} as const;

/** A scroll area counts as at its bottom within this distance, px, and keeps following new content. */
export const SCROLL_FOLLOW_THRESHOLD_PX = 48;

/** The one row a run of the model's work folds into once its answer starts. */
export const CHAT_ACTIVITY_COPY = {
  thought: 'Thought',
  tools: (count: number) => `Used ${count} ${count === 1 ? 'tool' : 'tools'}`,
  failed: (count: number) => `${count} failed`,
} as const;

/** The composer's thinking levels, in menu order, with their names. */
export const REASONING_EFFORT_LEVELS: ReadonlyArray<{ value: ReasoningEffort; label: string }> = [
  { value: 'provider-default', label: 'Default' },
  { value: 'none', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

/** The model picker's own words. */
export const MODEL_PICKER_COPY = {
  /** On a local model's dot: it's in memory now, so it answers at once; picking another loads that one instead. */
  loaded: 'Loaded now',
} as const;
