/**
 * Modalities Store
 *
 * External store wrapping modalitiesService for reactive subscriptions.
 * Uses useSyncExternalStore — survives component unmounts.
 * Panels read via useModalities() hook instead of polling isLoaded().
 */

import { useSyncExternalStore } from 'react';
import { modalitiesService } from '@services/modalities';

type Listener = () => void;
const listeners = new Set<Listener>();
let currentLoaded = modalitiesService.isLoaded();

function emitChange() {
  currentLoaded = modalitiesService.isLoaded();
  for (const listener of listeners) listener();
}

async function ensureLoaded() {
  if (currentLoaded) return;
  await modalitiesService.ensureLoaded();
  emitChange();
}

export const modalitiesStore = {
  getSnapshot(): boolean {
    return currentLoaded;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  ensureLoaded,
};

export function useModalities(): boolean {
  return useSyncExternalStore(
    modalitiesStore.subscribe,
    modalitiesStore.getSnapshot,
    modalitiesStore.getSnapshot,
  );
}

/** Ensures modalities data is loaded — idempotent, safe to call from any component */
export function ensureModalitiesLoaded(): Promise<void> {
  return modalitiesStore.ensureLoaded();
}
