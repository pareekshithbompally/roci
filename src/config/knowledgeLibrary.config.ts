/** Knowledge: the documents you add (PDFs, text, Markdown), kept in the library for Roci to read; searchable by name. */

import { ATTACHMENT_TYPES } from '@config/chat.config';

const { pdf, text } = ATTACHMENT_TYPES;

export const KNOWLEDGE_LIBRARY = {
  /** Sidebar row and page title. */
  title: 'Knowledge',
  empty: 'Add PDFs, text and Markdown files with +. Roci keeps them here to read.',
  /** The Mac's empty screen adds where files can go. */
  emptyDrop: 'Add PDFs, text and Markdown files with +, or drop them here. Roci keeps them here to read.',
  searchPlaceholder: 'Search knowledge',
  noMatch: 'No documents match',
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
  /** A text file shown as Markdown (headings, lists) rather than as plain words. */
  markdown: { mediaType: 'text/markdown', extension: 'md' },
  /** How many the page loads (newest first). */
  listLimit: 500,
  /** Mac: the list column beside the open document. */
  listColumn: 'w-80 shrink-0',
} as const;
