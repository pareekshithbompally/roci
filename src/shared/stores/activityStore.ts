/**
 * Activity Store
 *
 * Generic external store for all ongoing background operations.
 * Uses useSyncExternalStore pattern (same as downloadStore).
 *
 * The store is dumb — it holds a list. Callers manage lifecycle
 * (add on start, update on progress, remove on completion).
 */

import { useSyncExternalStore } from 'react';

// ── Types ───────────────────────────────────────────────────────

export type ActivityType =
  | 'recording'
  | 'processing'
  | 'download'
  | 'indexing'
  | 'import';

export type ActivityStatus = 'active' | 'complete' | 'error' | 'cancelled';

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

type Listener = () => void;

// ── Internal state ──────────────────────────────────────────────

const listeners = new Set<Listener>();
let items: ActivityItem[] = [];

function emitChange() {
  for (const listener of listeners) listener();
}

// ── Store API ───────────────────────────────────────────────────

export const activityStore = {
  add(item: ActivityItem) {
    items = [...items, item];
    emitChange();
  },

  update(id: string, patch: Partial<ActivityItem>) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    emitChange();
  },

  remove(id: string) {
    const before = items.length;
    items = items.filter((i) => i.id !== id);
    if (items.length !== before) emitChange();
  },

  get(id: string): ActivityItem | undefined {
    return items.find((i) => i.id === id);
  },

  getSnapshot(): ActivityItem[] {
    return items;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * React hook — returns all activity items.
 * Only triggers re-renders when the items array reference changes.
 */
export function useActivityItems(): ActivityItem[] {
  return useSyncExternalStore(
    activityStore.subscribe,
    activityStore.getSnapshot,
    activityStore.getSnapshot,
  );
}
