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

  /** Meetings and chats listed under the documents (each, newest first). */
  conversationLimit: 50,
  sections: { meetings: 'Meetings', chats: 'Chats' },
  /** The scope bar over the list: which kinds show. */
  scopes: [
    { value: 'all', label: 'All' },
    { value: 'file', label: 'Documents' },
    { value: 'meeting', label: 'Meetings' },
    { value: 'chat', label: 'Chats' },
  ],
  scopeLabel: 'Show',
  /** ⋯ Show: file type, indexing state and order. */
  show: {
    label: 'More',
    fileType: { title: 'File type', options: { all: 'All files', pdf: 'PDF', markdown: 'Markdown', text: 'Text and CSV' } },
    state: { title: 'State', options: { any: 'Any', pending: 'Indexing', failed: 'Couldn’t read' } },
    sort: { title: 'Sort', options: { newest: 'Newest', name: 'Name' } },
  },
  /** A meeting's or chat's preview in the pane. */
  preview: { openMeeting: 'Open in Meetings', openChat: 'Open in Chats', noSummary: 'No summary yet.', you: 'You', roci: 'Roci' },
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

/** The reader: a document's own window on a Mac (like Preview), a full-screen page on iPhone; its chat beside the pages. */
export const READER = {
  open: 'Open in its own window',
  openPhone: 'Open',
  chatPlaceholder: 'Ask about this document',
  chatAbout: (name: string) => `Asking about ${name}`,
  /** The address part a reader window is opened with (`?reader=<app path>&page=3&ask=1`). */
  param: { path: 'reader', page: 'page', ask: 'ask' },
  /** Main window → a reader window: show this page, open or close the chat. */
  event: 'reader://go',
  /** A reader window's size and its least (points), and where its traffic lights sit (the main window's). */
  window: { width: 1180, height: 820, minWidth: 720, minHeight: 520, trafficLights: { x: 20, y: 32 } },
  /** The chat beside the pages: its width, and the reveal of the column it sits in. */
  chatColumn: 'w-80',
} as const;
