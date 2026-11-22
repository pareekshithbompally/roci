/** Dumb list of ongoing background operations; callers add, update and remove items. */

import { create } from 'zustand';

// ── Types ───────────────────────────────────────────────────────

export type ActivityType =
  | 'recording'
  | 'processing'
  | 'download'
  | 'indexing'
  | 'import'
  /** Audio playing away from its player (the minimized player); built from the playback store, never stored here. */
  | 'playback';

/** `waiting`: nothing is running yet; the row needs the user (e.g. an update to install). */
export type ActivityStatus = 'active' | 'waiting' | 'complete' | 'error' | 'cancelled';

export interface ActivityAction {
  icon: string;
  label: string;
  onClick: () => void;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  label: string;
  status: ActivityStatus;
  percent: number | null;
  step: { current: number; total: number } | null;
  detail: string | null;
  error: string | null;
  actions: ActivityAction[];
}

// ── Store ───────────────────────────────────────────────────────

/** The rows; replaced on each change. */
export const useActivityStore = create<{ items: ActivityItem[] }>(() => ({ items: [] }));
const items = (): ActivityItem[] => useActivityStore.getState().items;
const setItems = (next: ActivityItem[]): void => useActivityStore.setState({ items: next });

/** Writers and reads outside React. */
export const activityStore = {
  add(item: ActivityItem) {
    setItems([...items(), item]);
  },

  update(id: string, patch: Partial<ActivityItem>) {
    if (!items().some((i) => i.id === id)) return;
    setItems(items().map((i) => (i.id === id ? { ...i, ...patch } : i)));
  },

  remove(id: string) {
    if (items().some((i) => i.id === id)) setItems(items().filter((i) => i.id !== id));
  },

  get(id: string): ActivityItem | undefined {
    return items().find((i) => i.id === id);
  },

  getSnapshot: items,
};

/** All activity rows; re-renders when they change. */
export const useActivityItems = (): ActivityItem[] => useActivityStore((s) => s.items);
