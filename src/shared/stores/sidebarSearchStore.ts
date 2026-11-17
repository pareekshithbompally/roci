/** Searching the sidebar's sessions: on or off and the query. ⌘K, the menu bar and the Search button start it; picking a result or Escape ends it. */

import { create } from 'zustand';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';

interface SidebarSearchState {
  active: boolean;
  query: string;
}

const useSidebarSearchStore = create<SidebarSearchState>()(() => ({ active: false, query: '' }));

export const useSidebarSearchActive = () => useSidebarSearchStore((s) => s.active);
export const useSidebarSearchQuery = () => useSidebarSearchStore((s) => s.query);

/** Opens the sidebar into search (the field takes focus). */
export function startSidebarSearch(): void {
  useLeftPanel.getState().setLeftPanel(true);
  useSidebarSearchStore.setState({ active: true });
}

export function setSidebarSearchQuery(query: string): void {
  useSidebarSearchStore.setState({ query });
}

/** Back to the recents list. */
export function endSidebarSearch(): void {
  useSidebarSearchStore.setState({ active: false, query: '' });
}

/** ⌘K: start, or end when already searching. */
export function toggleSidebarSearch(): void {
  if (useSidebarSearchStore.getState().active) endSidebarSearch();
  else startSidebarSearch();
}
