/** Chat UI and session management constants. */

import type { ReasoningEffort } from '@shared/types';

/** Number of items to show initially in the unified sidebar. More load on scroll. */
export const SIDEBAR_PAGE_SIZE = 25;
/** Placeholder rows shown while the sidebar's next page loads. */
export const SIDEBAR_SHIMMER_ROWS = 3;

/** In-app meeting and chat search (⌘K palette, iPhone sidebar): debounce (ms), short because it runs in the local Rust backend. */
export const SESSION_SEARCH_DEBOUNCE_MS = 150;

/** Minimum query length for content search; 1-char queries scan the whole dictionary. */
export const SESSION_SEARCH_MIN_QUERY_LENGTH = 2;

/** Max results per source type returned by search_sessions (a full list, Show All, asks for more). */
export const SESSION_SEARCH_LIMIT = 6;

/** How much of a tool's output its row shows when opened (the chat keeps the whole output, which the model reads back). */
export const TOOL_RESULT_PREVIEW_CHARS = 500;

/** Attachments one message can carry. */
export const CHAT_MAX_ATTACHMENTS = 10;

/** Attached files by what reads them: a PDF (models that take PDFs), and text, which every model reads (sent as its
 *  contents), known by its media type or, when the system gives it none, its extension. */
export const ATTACHMENT_TYPES = {
  pdf: { mediaType: 'application/pdf', extension: '.pdf' },
  text: {
    mediaTypePrefix: 'text/',
    mediaTypes: ['application/json'],
    extensions: ['.txt', '.md', '.csv', '.json'],
    /** The most of one text file a model is sent (about 25k tokens); the rest is said to be cut. */
    maxChars: 100_000,
  },
} as const;

export const ATTACHMENT_COPY = {
  openFailed: (name: string) => `Couldn't open ${name}`,
} as const;

/** A new chat's title is the question's first this-many characters until the model names it. */
export const CHAT_TITLE_MAX_CHARS = 30;

/** A message's menus: the question's (a long press, a right-click) and the reply's ⋯ details. */
export const CHAT_MESSAGE_MENU_COPY = {
  question: 'Message',
  copy: 'Copy',
  details: 'Reply details',
} as const;

/** The markdown link title that marks a link as a source the reply cites: drawn as a pill, named by its site. */
export const SOURCE_LINK_TITLE = 'source';

/** Follow-up suggestions shown under a reply. */
export const SUGGESTION_COUNT = 3;

/** The composer's textarea grows with its text up to this height, px, then scrolls. */
export const COMPOSER_MAX_HEIGHT_PX = 200;

/** Under this width, px (the meeting chat's window, a narrow main window), the composer's toolbar shows icons only. */
export const COMPOSER_ICON_ONLY_BELOW_PX = 520;

/** The meeting chat window: its field's hint (the window is already about the meeting, so nothing else repeats it). */
export const MEETING_CHAT_PLACEHOLDER = 'Ask about this meeting…';

/** Meetings offered in the composer's @ list, newest first. */
export const MENTION_RECENT_MEETINGS = 20;

/** Words for a draft with no text of its own. */
export const CHAT_DRAFT_COPY = {
  untitledAttachment: 'Attachment',
} as const;

/** Dictation failures, shown as an error toast with the reason after them. */
export const DICTATION_COPY = {
  startFailed: 'Couldn’t start dictation',
  transcribeFailed: 'Couldn’t transcribe dictation',
  /** The greyed mic's label while a recording holds iPhone's one audio session. */
  offWhileRecording: 'Voice input is off while recording',
} as const;

/** What a reply's header says before its first word, in the order it's checked. */
export const CHAT_LOADING_COPY = {
  'loading-catalog': 'Getting model list',
  'loading-weights': 'Loading weights',
  'loading-draft': 'Loading draft',
  'loading-projector': 'Loading projector',
  'reading-prompt': 'Reading your message',
  working: 'Working on it…',
} as const;

/** A reply that can't start because the models.dev list (what each model can do) isn't on this Mac and can't be downloaded. */
export const CHAT_CATALOG_COPY = {
  unavailable: 'Couldn’t get the model list from models.dev. Check your connection, then send again.',
} as const;

/** What chat replies cost (the reply's gauge, the context ring), by the same price rule as Settings › Usage. */
export const CHAT_COST_COPY = {
  unpriced: (replies: number) => `${replies} ${replies === 1 ? 'reply has' : 'replies have'} no price`,
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

/** A reply that failed (ErrorMessageBox). */
export const CHAT_ERROR_COPY = {
  unknown: 'The model returned an error.',
  showDetails: 'Show error details',
  hideDetails: 'Hide error details',
} as const;

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
  /** On hover over the picker of a chat that has answered: a chat keeps its model. */
  locked: 'This chat keeps its model. Start a new chat to use another.',
  select: 'Select model',
  noModels: 'No models available - configure providers first',
} as const;

/** The composer's + sheet (iPhone): its title and groups. */
/** The composer's words: the field, its hints (a Mac rotates them; a phone has one) and its bar's controls. */
export const COMPOSER_COPY = {
  message: 'Message',
  placeholder: 'Ask anything',
  /** `focusKey`: the shortcut that jumps to the composer (⌘L). */
  hints: (focusKey: string) => ['Ask anything...', 'Type @ to add meeting context', `Press ${focusKey} to jump here`, 'Ask about your meetings...'],
  send: 'Send message',
  stop: 'Stop generation',
  voice: 'Voice input',
} as const;

export const COMPOSER_ADD_COPY = { title: 'Add', meeting: 'Meeting', record: 'Record', attach: 'Attach' } as const;
