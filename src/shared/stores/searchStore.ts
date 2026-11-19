/** Searching (and running commands): open or closed, and the query. ⌘K, the menu bar and the Search row open it; running a
 *  command or Escape at the root closes it. Shown as the command palette beside a column sidebar (Mac, iPad), in the sheet
 *  sidebar on iPhone. */

import { create } from 'zustand';

interface SearchState {
  active: boolean;
  query: string;
}

const useSearchStore = create<SearchState>()(() => ({ active: false, query: '' }));

export const useSearchActive = () => useSearchStore((s) => s.active);
export const useSearchQuery = () => useSearchStore((s) => s.query);

export function startSearch(): void {
  useSearchStore.setState({ active: true });
}

export function setSearchQuery(query: string): void {
  useSearchStore.setState({ query });
}

/** Closed, and the query cleared for the next search. */
export function endSearch(): void {
  useSearchStore.setState({ active: false, query: '' });
}

/** ⌘K: start, or end when already searching. */
export function toggleSearch(): void {
  if (useSearchStore.getState().active) endSearch();
  else startSearch();
}
