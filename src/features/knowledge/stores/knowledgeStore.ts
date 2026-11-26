/** Which document Knowledge has open, so other places can open one there (a citation under an answer, a related source):
 *  by its id or its app path, whichever the caller knows. */

import { create } from 'zustand';
import { useAppStore } from '@shared/stores/appStore';

interface KnowledgeState {
  /** The open document's id or app path; none: the newest (Mac) or the list (iPhone). */
  selected: string | null;
  select: (key: string | null) => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  selected: null,
  select: (key) => set({ selected: key }),
}));

/** Shows Knowledge with this document open. */
export function openDocument(key: string): void {
  useKnowledgeStore.getState().select(key);
  useAppStore.getState().setCurrentView('knowledge');
}
