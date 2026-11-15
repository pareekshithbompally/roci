/**
 * useOnDeviceModel — one on-device model's download state and actions.
 *
 * Lifecycle, as the button shows it:
 *   idle ──click──▶ busy (spinner from the click; % once the download reports)
 *        ◀─fail──   busy ──ok──▶ ready ──Re-download──▶ busy …
 *
 * "Busy" is the union of two truths: a load we started (pending, marked on
 * click and cleared when it settles — the tray row is debounced 400ms to
 * hide cache hits, so it can't carry the click) and a tray row from a load
 * started elsewhere (e.g. Rebuild index). A failed load returns to idle;
 * OnDeviceModelActivity raises the error toast with Retry.
 *
 * A Download press is explicit consent: it grants the gate, then loads.
 */

import { useReducer } from 'react';
import { create } from 'zustand';
import { grantConsent, isEmbeddingReady, preloadModel, resetPipeline } from '@extensions/rag';
import { DOWNLOADABLE_VOICE_IDS, isVoiceReady, loadVoice, resetVoice, voiceTrayId } from '@extensions/voice';
import type { DownloadableVoiceId } from '@extensions/voice';
import { useActivityItems } from '@shared/stores/activityStore';

/** The embedding model, or a downloadable read-aloud voice. */
export type OnDeviceModelKind = 'rag' | DownloadableVoiceId;
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
  /** Record consent where an implicit trigger asks first (RAG); a voice downloads only on a press. */
  grant?: () => void;
  load: () => Promise<unknown>;
  reset: () => void;
}

const voiceSource = (id: DownloadableVoiceId): ModelSource => ({
  trayId: voiceTrayId(id),
  isReady: () => isVoiceReady(id),
  load: () => loadVoice(id),
  reset: () => resetVoice(id),
});

const MODELS: Record<OnDeviceModelKind, ModelSource> = {
  rag: { trayId: 'rag-model', isReady: isEmbeddingReady, grant: grantConsent, load: preloadModel, reset: resetPipeline },
  ...Object.fromEntries(DOWNLOADABLE_VOICE_IDS.map((id) => [id, voiceSource(id)])),
} as Record<OnDeviceModelKind, ModelSource>;

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

/** Several models at once (e.g. every downloadable voice), by kind. */
export function useOnDeviceModels<K extends OnDeviceModelKind>(kinds: readonly K[]): Record<K, OnDeviceModel> {
  const pending = usePendingStore();
  const items = useActivityItems();
  // Readiness lives outside React; re-render once a load settles.
  const [, refresh] = useReducer((x: number) => x + 1, 0);

  const entries = kinds.map((kind) => {
    const model = MODELS[kind];
    const item = items.find((i) => i.id === model.trayId);
    const busy = (pending[kind] ?? false) || item?.status === 'active';
    const state: OnDeviceModel = {
      status: busy ? 'busy' : model.isReady() ? 'ready' : 'idle',
      percent: busy ? (item?.percent ?? null) : null,
      download: () => startLoad(kind, false, refresh),
      redownload: () => startLoad(kind, true, refresh),
    };
    return [kind, state] as const;
  });
  return Object.fromEntries(entries) as Record<K, OnDeviceModel>;
}

export function useOnDeviceModel(kind: OnDeviceModelKind): OnDeviceModel {
  return useOnDeviceModels([kind])[kind];
}
