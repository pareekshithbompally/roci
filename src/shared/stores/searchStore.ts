/** Searching (and running commands): open or closed, and the query. ⌘K, the menu bar and the Search row open it; running a
 *  command or Escape at the root closes it. Shown as the command palette beside a column sidebar (Mac, iPad), in the sheet
 *  sidebar on iPhone. */

import { create } from 'zustand';

interface SearchState {
  active: boolean;
  query: string;
  /** Counts finished searches. iPhone's search grows out of its button through a shared layout id that carries this, so
   *  a closing search never pulls the button back through the screen: the button returns as a new element, in place. */
  round: number;
}

const useSearchStore = create<SearchState>()(() => ({ active: false, query: '', round: 0 }));

export const useSearchActive = () => useSearchStore((s) => s.active);
export const useSearchQuery = () => useSearchStore((s) => s.query);
export const useSearchRound = () => useSearchStore((s) => s.round);

export function startSearch(): void {
  useSearchStore.setState({ active: true });
}

export function setSearchQuery(query: string): void {
  useSearchStore.setState({ query });
}

/** Closed, and the query cleared for the next search. */
export function endSearch(): void {
  useSearchStore.setState((s) => ({ active: false, query: '', round: s.round + 1 }));
}

/** ⌘K: start, or end when already searching. */
export function toggleSearch(): void {
  if (useSearchStore.getState().active) endSearch();
  else startSearch();
}
