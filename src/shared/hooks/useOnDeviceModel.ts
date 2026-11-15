/** One on-device model: busy covers our own pending load and any tray row; a Download press grants consent. */

import { useReducer } from 'react';
import { create } from 'zustand';
import { grantConsent, isEmbeddingReady, preloadModel, resetPipeline } from '@extensions/rag';
import { useActivityItems } from '@shared/stores/activityStore';

/** The embedding model (transformers.js). Kasset's other local models: `useLocalModels`. */
export type OnDeviceModelKind = 'rag';
export type OnDeviceStatus = 'idle' | 'busy' | 'ready';

export interface OnDeviceModel {
  status: OnDeviceStatus;
  /** 0–100 once the download reports progress; null before that and while initializing. */
  percent: number | null;
  download: () => void;
  redownload: () => void;
}

interface ModelSource {
  trayId: string;
  isReady: () => boolean;
  /** Record consent where an implicit trigger asks first (RAG). */
  grant?: () => void;
  load: () => Promise<unknown>;
  reset: () => void;
}

const MODELS: Record<OnDeviceModelKind, ModelSource> = {
  rag: { trayId: 'rag-model', isReady: isEmbeddingReady, grant: grantConsent, load: preloadModel, reset: resetPipeline },
};

/** Loads started from a Download press — shared so every surface agrees. */
const usePendingStore = create<Partial<Record<OnDeviceModelKind, boolean>>>()(() => ({}));
const setPending = (kind: OnDeviceModelKind, pending: boolean) => usePendingStore.setState({ [kind]: pending });

function startLoad(kind: OnDeviceModelKind, fresh: boolean, settled: () => void): void {
  if (usePendingStore.getState()[kind]) return;
  const model = MODELS[kind];
  setPending(kind, true);
  model.grant?.();
  if (fresh) model.reset();
  model
    .load()
    .catch((error: unknown) => console.error(`[useOnDeviceModel] ${kind} load failed:`, error))
    .finally(() => {
      setPending(kind, false);
      settled();
    });
}

export function useOnDeviceModel(kind: OnDeviceModelKind): OnDeviceModel {
  const pending = usePendingStore((st) => st[kind] ?? false);
  const items = useActivityItems();
  // Readiness lives outside React; re-render once a load settles.
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const model = MODELS[kind];
  const item = items.find((i) => i.id === model.trayId);
  const busy = pending || item?.status === 'active';
  return {
    status: busy ? 'busy' : model.isReady() ? 'ready' : 'idle',
    percent: busy ? (item?.percent ?? null) : null,
    download: () => startLoad(kind, false, refresh),
    redownload: () => startLoad(kind, true, refresh),
  };
}
