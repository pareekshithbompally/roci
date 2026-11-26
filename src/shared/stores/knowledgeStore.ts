/** Knowledge as you left it: what is open (a document, a meeting or a chat), how the list is narrowed, and the document open
 *  in the reader on iPhone (at which page, with its chat or not). Kept here so the reader can be opened from anywhere (an
 *  answer's page pill) and so coming back to Knowledge finds it unchanged. */

import { create } from 'zustand';

/** What a Knowledge item is. */
export type KnowledgeKind = 'file' | 'meeting' | 'chat';

/** An item by its kind and key (a document by its id or app path, a meeting or chat by its id). */
export interface KnowledgeSelection {
  kind: KnowledgeKind;
  key: string;
}

/** How the list is narrowed: which kinds, which file types, which indexing state, in what order. */
export interface KnowledgeFilter {
  scope: 'all' | KnowledgeKind;
  fileType: 'all' | 'pdf' | 'markdown' | 'text';
  state: 'any' | 'pending' | 'failed';
  sort: 'newest' | 'name';
}

/** The reader's document, the page to show (from an answer's pill), and whether its chat is beside it. */
export interface Reading {
  key: string;
  page?: number;
  asking: boolean;
}

interface KnowledgeState {
  selected: KnowledgeSelection | null;
  filter: KnowledgeFilter;
  reading: Reading | null;
  select: (selection: KnowledgeSelection | null) => void;
  setFilter: (change: Partial<KnowledgeFilter>) => void;
  read: (reading: Reading | null) => void;
}

const ALL: KnowledgeFilter = { scope: 'all', fileType: 'all', state: 'any', sort: 'newest' };

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  selected: null,
  filter: ALL,
  reading: null,
  select: (selected) => set({ selected }),
  setFilter: (change) => set((state) => ({ filter: { ...state.filter, ...change } })),
  read: (reading) => set({ reading }),
}));
