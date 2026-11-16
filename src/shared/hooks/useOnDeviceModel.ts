/** One on-device model: busy covers our own pending load and any tray row; a Download press grants consent. */

import { useReducer } from 'react';
import { create } from 'zustand';
import { EMBEDDING_MODEL_NAME, EMBEDDING_MODEL_SIZE, grantConsent, isEmbeddingReady, preloadModel, removeModel } from '@extensions/rag';
import { confirm } from '@shared/stores/confirmStore';
import { useActivityItems } from '@shared/stores/activityStore';

/** The embedding model (transformers.js). Kasset's other local models: `useLocalModels`. */
export type OnDeviceModelKind = 'rag';
export type OnDeviceStatus = 'idle' | 'busy' | 'ready';

/** Every on-device model's control, whichever runtime owns it: its state, Download, and Delete. */
export interface OnDeviceModel {
  status: OnDeviceStatus;
  /** 0–100 once the download reports progress; null before that and while initializing. */
  percent: number | null;
  download: () => void;
  /** Asks first, then removes the model's files. */
  remove: () => void;
}

/** Asks before deleting a model: one confirm for every on-device model. */
export function confirmModelDelete(name: string, size: string): Promise<boolean> {
  return confirm({
    title: `Delete ${name}?`,
    description: `Frees ${size}. You can download it again anytime.`,
    confirmLabel: 'Delete',
    tone: 'danger',
  });
}

interface ModelSource {
  trayId: string;
  name: string;
  size: string;
  isReady: () => boolean;
  /** Record consent where an implicit trigger asks first (RAG). */
  grant?: () => void;
  load: () => Promise<unknown>;
  remove: () => Promise<void>;
}

const MODELS: Record<OnDeviceModelKind, ModelSource> = {
  rag: {
    trayId: 'rag-model',
    name: EMBEDDING_MODEL_NAME,
    size: EMBEDDING_MODEL_SIZE,
    isReady: isEmbeddingReady,
    grant: grantConsent,
    load: preloadModel,
    remove: removeModel,
  },
};

/** Loads started from a Download press — shared so every surface agrees. */
const usePendingStore = create<Partial<Record<OnDeviceModelKind, boolean>>>()(() => ({}));
const setPending = (kind: OnDeviceModelKind, pending: boolean) => usePendingStore.setState({ [kind]: pending });

function startLoad(kind: OnDeviceModelKind, settled: () => void): void {
  if (usePendingStore.getState()[kind]) return;
  const model = MODELS[kind];
  setPending(kind, true);
  model.grant?.();
  model
    .load()
    .catch((error: unknown) => console.error(`[useOnDeviceModel] ${kind} load failed:`, error))
    .finally(() => {
      setPending(kind, false);
      settled();
    });
}

async function removeAfterConfirm(kind: OnDeviceModelKind, settled: () => void): Promise<void> {
  const model = MODELS[kind];
  if (!(await confirmModelDelete(model.name, model.size))) return;
  try {
    await model.remove();
  } catch (error: unknown) {
    console.error(`[useOnDeviceModel] ${kind} delete failed:`, error);
  } finally {
    settled();
  }
}

export function useOnDeviceModel(kind: OnDeviceModelKind): OnDeviceModel {
  const pending = usePendingStore((st) => st[kind] ?? false);
  const items = useActivityItems();
  // Readiness lives outside React; re-render once a load or delete settles.
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const model = MODELS[kind];
  const item = items.find((i) => i.id === model.trayId);
  const busy = pending || item?.status === 'active';
  return {
    status: busy ? 'busy' : model.isReady() ? 'ready' : 'idle',
    percent: busy ? (item?.percent ?? null) : null,
    download: () => startLoad(kind, refresh),
    remove: () => void removeAfterConfirm(kind, refresh),
  };
}
