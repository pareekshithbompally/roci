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
import { VOICE_TRAY_ID, grantVoiceConsent, isVoiceReady, preloadVoice, resetVoice } from '@extensions/voice';
import { useActivityItems } from '@shared/stores/activityStore';

export type OnDeviceModelKind = 'rag' | 'voice';
export type OnDeviceStatus = 'idle' | 'busy' | 'ready';

export interface OnDeviceModel {
  status: OnDeviceStatus;
  /** 0–100 once the download reports progress; null before that and while initializing. */
  percent: number | null;
  download: () => void;
  redownload: () => void;
}

const MODELS = {
  rag: { trayId: 'rag-model', isReady: isEmbeddingReady, grant: grantConsent, load: preloadModel, reset: resetPipeline },
  voice: { trayId: VOICE_TRAY_ID, isReady: isVoiceReady, grant: grantVoiceConsent, load: preloadVoice, reset: resetVoice },
} as const;

/** Loads started from a Download press — shared so every surface agrees. */
const usePendingStore = create<Record<OnDeviceModelKind, boolean>>()(() => ({ rag: false, voice: false }));
const setPending = (kind: OnDeviceModelKind, pending: boolean) => usePendingStore.setState({ [kind]: pending });

export function useOnDeviceModel(kind: OnDeviceModelKind): OnDeviceModel {
  const pending = usePendingStore((s) => s[kind]);
  const items = useActivityItems();
  // Readiness lives outside React; re-render once a load settles.
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const model = MODELS[kind];
  const item = items.find((i) => i.id === model.trayId);
  const busy = pending || item?.status === 'active';

  const run = (fresh: boolean) => () => {
    if (usePendingStore.getState()[kind]) return;
    setPending(kind, true);
    model.grant();
    if (fresh) model.reset();
    model
      .load()
      .catch((error: unknown) => console.error(`[useOnDeviceModel] ${kind} load failed:`, error))
      .finally(() => {
        setPending(kind, false);
        refresh();
      });
  };

  return {
    status: busy ? 'busy' : model.isReady() ? 'ready' : 'idle',
    percent: busy ? (item?.percent ?? null) : null,
    download: run(false),
    redownload: run(true),
  };
}
