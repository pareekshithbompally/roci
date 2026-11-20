/** Renders nothing: a search-index rebuild's progress (reported by Rust) as an activity-tray row, removed when it's done. */

import { useEffect } from 'react';
import { onIndexProgress, type IndexProgress } from '@extensions/rag';
import { activityStore } from '@shared/stores/activityStore';

const ROWS = {
  meetings: { id: 'search-index-meetings', label: 'Indexing meetings' },
  chats: { id: 'search-index-chats', label: 'Indexing chats' },
} as const;

const clear = () => Object.values(ROWS).forEach((row) => activityStore.remove(row.id));

function show({ kind, current, total, done }: IndexProgress): void {
  if (done || !kind) {
    clear();
    return;
  }
  const row = ROWS[kind];
  const step = { current, total };
  const percent = Math.round((current / Math.max(total, 1)) * 100);
  if (activityStore.get(row.id)) {
    activityStore.update(row.id, { step, percent });
    return;
  }
  // Moving on to chats: the meetings row is finished.
  clear();
  activityStore.add({ id: row.id, type: 'indexing', label: row.label, status: 'active', percent, step, detail: null, error: null, actions: [] });
}

export const SearchIndexActivity: React.FC = () => {
  useEffect(() => {
    const listening = onIndexProgress(show);
    return () => {
      void listening.then((stop) => stop());
      clear();
    };
  }, []);

  return null;
};
