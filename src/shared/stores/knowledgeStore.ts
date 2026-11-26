/** Which document Knowledge has open, and whether it is open full window in the reader (at which page, with its chat or
 *  not), so other places can open one there (an answer's page pill, a related source): by its id or its app path. */

import { create } from 'zustand';
import { useAppStore } from '@shared/stores/appStore';

/** The reader's document, the page to show (from an answer's pill), and whether its chat is beside it. */
export interface Reading {
  key: string;
  page?: number;
  asking: boolean;
}

interface KnowledgeState {
  /** The open document's id or app path; none: the newest (Mac) or the list (iPhone). */
  selected: string | null;
  reading: Reading | null;
  select: (key: string | null) => void;
  read: (reading: Reading | null) => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  selected: null,
  reading: null,
  select: (key) => set({ selected: key }),
  read: (reading) => set({ reading }),
}));

/** Shows the document in the reader, at `page` when an answer cited one. */
export function openDocument(key: string, page?: number): void {
  useKnowledgeStore.setState({ selected: key, reading: { key, page, asking: false } });
  useAppStore.getState().setCurrentView('knowledge');
}
