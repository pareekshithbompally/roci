/**
 * Download Store (Zustand)
 *
 * Tracks the single active download (model or binary). Only one download runs
 * at a time — Rust emits to a single progress channel — so the store owns one
 * `active` slot through its lifecycle: start → progress → complete/error/cancel.
 *
 * - React reads via `useActiveDownload()` (selector hook).
 * - Imperative callers use `useDownloadStore.getState().start*()`.
 * - Successful completions fire `onDownloadComplete` listeners with the result.
 *
 * The store survives component unmounts (module-level Zustand store), so the
 * global DownloadBanner / ActivityTray can render progress from any screen.
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import * as models from './models';
import * as backend from './backend';
import type {
  DownloadProgress,
  BinaryDownloadPhase,
  ManagedModel,
  InstalledBinary,
} from './types';

// ── Types ───────────────────────────────────────────────────────

export type DownloadType = 'model' | 'binary';
export type DownloadStatus = 'downloading' | 'completed' | 'error' | 'cancelled';

export interface ActiveDownload {
  id: string;
  type: DownloadType;
  fileName: string;
  progress: DownloadProgress;
  phase: BinaryDownloadPhase | null;
  status: DownloadStatus;
  error: string | null;
}

type CompletionCallback = (type: DownloadType, result: ManagedModel | InstalledBinary) => void;

interface DownloadStore {
  active: ActiveDownload | null;
  startModelDownload: (repoId: string, fileName: string, hfToken?: string) => void;
  startUrlDownload: (url: string, hfToken?: string) => void;
  startBinaryDownload: () => void;
  cancel: () => Promise<void>;
}

// ── Module-level lifecycle helpers (non-reactive) ───────────────

const completionListeners = new Set<CompletionCallback>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Register a callback fired when any download completes successfully. */
export function onDownloadComplete(cb: CompletionCallback): () => void {
  completionListeners.add(cb);
  return () => completionListeners.delete(cb);
}

// ── Store ───────────────────────────────────────────────────────

export const useDownloadStore = create<DownloadStore>()((set, get) => {
  /** Only accept progress that moves forward (guards out-of-order event jitter). */
  const isProgressForward = (next: DownloadProgress): boolean => {
    const active = get().active;
    return !active || next.bytesDownloaded >= active.progress.bytesDownloaded;
  };

  /** Patch the active download only if it's still the same one. */
  const patchActive = (id: string, patch: Partial<ActiveDownload>) => {
    const active = get().active;
    if (active?.id === id) set({ active: { ...active, ...patch } });
  };

  const scheduleClear = (id: string, delay = 3000) => {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      if (get().active?.id === id) set({ active: null });
      clearTimer = null;
    }, delay);
  };

  const onProgress = (id: string) => (progress: DownloadProgress) => {
    const active = get().active;
    if (active?.id === id && active.status === 'downloading' && isProgressForward(progress)) {
      set({ active: { ...active, progress } });
    }
  };

  const onSuccess = (id: string, type: DownloadType) =>
    (result: ManagedModel | InstalledBinary) => {
      if (get().active?.id !== id) return;
      patchActive(id, { status: 'completed', phase: type === 'binary' ? 'done' : null });
      for (const cb of completionListeners) cb(type, result);
      scheduleClear(id);
    };

  const onFailure = (id: string) => (e: unknown) => {
    if (get().active?.id !== id) return;
    const msg = e instanceof Error ? e.message : String(e);
    const cancelled = msg === 'Download cancelled';
    patchActive(id, { status: cancelled ? 'cancelled' : 'error', error: cancelled ? null : msg });
    scheduleClear(id);
  };

  const begin = (active: ActiveDownload): boolean => {
    if (get().active?.status === 'downloading') return false; // one at a time
    set({ active });
    return true;
  };

  return {
    active: null,

    startModelDownload(repoId, fileName, hfToken) {
      const id = crypto.randomUUID();
      if (!begin({
        id,
        type: 'model',
        fileName: fileName.split('/').pop() || fileName,
        progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
        phase: null,
        status: 'downloading',
        error: null,
      })) return;

      models
        .downloadModelFromRepo(repoId, fileName, onProgress(id), hfToken)
        .then(onSuccess(id, 'model'))
        .catch(onFailure(id));
    },

    startUrlDownload(url, hfToken) {
      const id = crypto.randomUUID();
      if (!begin({
        id,
        type: 'model',
        fileName: url.split('/').pop() || 'model.gguf',
        progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
        phase: null,
        status: 'downloading',
        error: null,
      })) return;

      models
        .downloadModel(url, onProgress(id), hfToken)
        .then(onSuccess(id, 'model'))
        .catch(onFailure(id));
    },

    startBinaryDownload() {
      const id = crypto.randomUUID();
      if (!begin({
        id,
        type: 'binary',
        fileName: 'llama-server',
        progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
        phase: 'downloading',
        status: 'downloading',
        error: null,
      })) return;

      backend
        .downloadBinary(onProgress(id), (phase) => patchActive(id, { phase }))
        .then(onSuccess(id, 'binary'))
        .catch(onFailure(id));
    },

    async cancel() {
      if (get().active?.status !== 'downloading') return;
      try {
        await invoke('plugin:llamacpp|cancel_download');
      } catch (e) {
        console.warn('[downloadStore] cancel invoke failed:', e);
      }
    },
  };
});

/** React hook: subscribe to the active download. */
export function useActiveDownload(): ActiveDownload | null {
  return useDownloadStore((s) => s.active);
}

// ── Bridge to ActivityTray ──────────────────────────────────────
// Translates download state into an activityStore row.

import { activityStore } from '@shared/stores/activityStore';
import type { ActivityItem } from '@shared/stores/activityStore';

const ACTIVITY_ID = 'llamacpp-download';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

useDownloadStore.subscribe((state) => {
  const dl = state.active;

  if (!dl) {
    activityStore.remove(ACTIVITY_ID);
    return;
  }

  if (dl.status !== 'downloading') {
    // completed / error / cancelled — remove row (toasts handled by the panel)
    activityStore.remove(ACTIVITY_ID);
    return;
  }

  const isPhaseIndeterminate = dl.phase === 'extracting' || dl.phase === 'validating';
  const label =
    dl.type === 'binary' && dl.phase === 'extracting'
      ? 'Extracting archive...'
      : dl.type === 'binary' && dl.phase === 'validating'
        ? 'Validating binary...'
        : `Downloading ${dl.fileName}`;

  const patch: Partial<ActivityItem> = {
    type: 'download',
    label,
    status: 'active',
    percent: isPhaseIndeterminate ? null : dl.progress.percent,
    detail: isPhaseIndeterminate
      ? null
      : `${formatBytes(dl.progress.bytesDownloaded)}${
          dl.progress.totalBytes > 0 ? ` / ${formatBytes(dl.progress.totalBytes)}` : ''
        }`,
    actions: [{ icon: 'x', label: 'Cancel', onClick: () => useDownloadStore.getState().cancel() }],
  };

  if (activityStore.get(ACTIVITY_ID)) {
    activityStore.update(ACTIVITY_ID, patch);
  } else {
    activityStore.add({ id: ACTIVITY_ID, step: null, error: null, ...patch } as ActivityItem);
  }
});
