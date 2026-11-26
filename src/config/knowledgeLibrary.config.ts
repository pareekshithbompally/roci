/** Knowledge: everything Roci reads (the documents you add, then your meetings and chats), searchable by name, each with
 *  how far indexing it has got. */

import { ATTACHMENT_TYPES } from '@config/chat.config';
import type { StateKind } from '@config/states.config';
import type { SourceState } from '@shared/types/native';

const { pdf, text } = ATTACHMENT_TYPES;

export const KNOWLEDGE_LIBRARY = {
  /** Sidebar row and page title. */
  title: 'Knowledge',
  emptyTitle: 'Ask about your documents',
  empty: 'Add PDFs, text and Markdown. Roci reads them on this device, and any chat can answer from them with the page it came from.',
  /** The Mac's empty screen adds where files can go. */
  emptyDrop: 'Add PDFs, text and Markdown, or drop them here. Roci reads them on this Mac, and any chat can answer from them with the page it came from.',
  searchPlaceholder: 'Search knowledge',
  noMatch: 'Nothing matches',
  documents: 'Documents',
  add: 'Add files',
  delete: 'Delete document',
  /** The confirm's noun: "Delete this document?". */
  noun: 'document',
  /** The file picker's filter: the files Knowledge reads. */
  accept: [pdf.mediaType, pdf.extension, ...text.extensions].join(','),
  unsupported: (name: string) => `${name} isn't a PDF, text or Markdown file`,
  addFailed: (name: string) => `Couldn't add ${name}`,
  deleteFailed: 'Couldn’t delete the document',
  readFailed: (name: string) => `Couldn't read ${name}`,
  loadFailed: 'Couldn’t load your documents',
  /** A text file shown as Markdown (headings, lists) rather than as plain words. */
  markdown: { mediaType: 'text/markdown', extension: 'md' },
  /** A document's index state, on its row and page: its words, and the app state that draws it (states.config). */
  states: {
    pending: { label: 'Indexing…', state: 'indexing' },
    ready: { label: 'Ready', state: 'ready' },
    failed: { label: 'Couldn’t read', state: 'failed' },
  } satisfies Record<SourceState, { label: string; state: StateKind }>,
  /** Rust → webview: a source's index state changed. */
  sourceEvent: 'knowledge://source',
  /** The sources about the same thing as a document, under its pages. */
  related: {
    title: 'Related',
    footer: 'Found by meaning on this device.',
    /** Cosine similarity a source must reach to show (0–1); tuned on real documents. */
    minScore: 0.55,
    limit: 5,
    kinds: { meeting: 'Meeting', chat: 'Chat', file: 'Document' },
  },
  /** Meetings and chats listed under the documents (each, newest first). */
  conversationLimit: 50,
  sections: { meetings: 'Meetings', chats: 'Chats' },
  /** How many the page loads (newest first). */
  listLimit: 500,
  /** Mac: the list column beside the open document. */
  listColumn: 'w-80 shrink-0',
} as const;

/** The reader's pages (shared PdfPages, pdf.js). */
export const PDF_PAGES = {
  /** A page's height to width before its own is read (US Letter). */
  letterRatio: 11 / 8.5,
  /** How far ahead of the view a page is drawn. */
  renderAhead: '800px',
  /** The widest a page is drawn, in px (a wide window reads a column, not a billboard). */
  maxWidth: 860,
  pageLabel: (n: number) => `Page ${n}`,
} as const;

/** The full-window reader and its chat. */
export const READER = {
  open: 'Open',
  ask: 'Ask about this',
  hideChat: 'Hide chat',
  close: 'Close',
  chatPlaceholder: 'Ask about this document',
  /** Mac: the chat beside the pages. */
  chatColumn: 'w-96',
} as const;
