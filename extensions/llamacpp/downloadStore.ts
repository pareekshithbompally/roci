/**
 * Download Store
 *
 * Module-level external store for tracking active downloads (model + binary).
 * Uses useSyncExternalStore pattern — survives component unmounts.
 *
 * Only one download can be active at a time (Rust emits to a single
 * progress event channel). The store owns the download lifecycle:
 * start → progress → complete/error/cancel.
 *
 * Components read state via useActiveDownload() hook. The global
 * DownloadBanner renders progress from any screen.
 */

import { useSyncExternalStore } from 'react';
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

type Listener = () => void;
type CompletionCallback = (type: DownloadType, result: ManagedModel | InstalledBinary) => void;

// ── Internal state ──────────────────────────────────────────────

const listeners = new Set<Listener>();
const completionCallbacks = new Set<CompletionCallback>();
let snapshot: ActiveDownload | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

/** Only accept progress if it moves forward (prevents out-of-order event jitter) */
function isProgressForward(next: DownloadProgress): boolean {
  if (!snapshot) return true;
  return next.bytesDownloaded >= snapshot.progress.bytesDownloaded;
}

function scheduleClear(id: string, delay = 3000) {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (snapshot?.id === id) {
      snapshot = null;
      emitChange();
    }
    clearTimer = null;
  }, delay);
}

// ── Store API ───────────────────────────────────────────────────

export const downloadStore = {
  /**
   * Start downloading a model from a HuggingFace repo.
   * The promise lives in module scope — survives component unmounts.
   */
  startModelDownload(
    repoId: string,
    fileName: string,
    hfToken?: string,
  ) {
    if (snapshot?.status === 'downloading') return; // already active

    const id = crypto.randomUUID();
    snapshot = {
      id,
      type: 'model',
      fileName: fileName.split('/').pop() || fileName,
      progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
      phase: null,
      status: 'downloading',
      error: null,
    };
    emitChange();

    models
      .downloadModelFromRepo(
        repoId,
        fileName,
        (progress) => {
          if (snapshot?.id === id && snapshot.status === 'downloading' && isProgressForward(progress)) {
            snapshot = { ...snapshot, progress };
            emitChange();
          }
        },
        hfToken,
      )
      .then((model) => {
        if (snapshot?.id === id) {
          snapshot = { ...snapshot, status: 'completed' };
          emitChange();
          for (const cb of completionCallbacks) cb('model', model);
          scheduleClear(id);
        }
      })
      .catch((e) => {
        if (snapshot?.id === id) {
          const msg = e instanceof Error ? e.message : String(e);
          snapshot = {
            ...snapshot,
            status: msg === 'Download cancelled' ? 'cancelled' : 'error',
            error: msg === 'Download cancelled' ? null : msg,
          };
          emitChange();
          scheduleClear(id);
        }
      });
  },

  /**
   * Start downloading a model from a direct HuggingFace URL.
   */
  startUrlDownload(url: string, hfToken?: string) {
    if (snapshot?.status === 'downloading') return;

    // Extract filename from URL for display
    const urlFileName = url.split('/').pop() || 'model.gguf';
    const id = crypto.randomUUID();
    snapshot = {
      id,
      type: 'model',
      fileName: urlFileName,
      progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
      phase: null,
      status: 'downloading',
      error: null,
    };
    emitChange();

    models
      .downloadModel(
        url,
        (progress) => {
          if (snapshot?.id === id && snapshot.status === 'downloading' && isProgressForward(progress)) {
            snapshot = { ...snapshot, progress };
            emitChange();
          }
        },
        hfToken,
      )
      .then((model) => {
        if (snapshot?.id === id) {
          snapshot = { ...snapshot, status: 'completed' };
          emitChange();
          for (const cb of completionCallbacks) cb('model', model);
          scheduleClear(id);
        }
      })
      .catch((e) => {
        if (snapshot?.id === id) {
          const msg = e instanceof Error ? e.message : String(e);
          snapshot = {
            ...snapshot,
            status: msg === 'Download cancelled' ? 'cancelled' : 'error',
            error: msg === 'Download cancelled' ? null : msg,
          };
          emitChange();
          scheduleClear(id);
        }
      });
  },

  /**
   * Start downloading the llama-server binary.
   */
  startBinaryDownload() {
    if (snapshot?.status === 'downloading') return;

    const id = crypto.randomUUID();
    snapshot = {
      id,
      type: 'binary',
      fileName: 'llama-server',
      progress: { bytesDownloaded: 0, totalBytes: 0, percent: 0 },
      phase: 'downloading',
      status: 'downloading',
      error: null,
    };
    emitChange();

    backend
      .downloadBinary(
        (progress) => {
          if (snapshot?.id === id && snapshot.status === 'downloading' && isProgressForward(progress)) {
            snapshot = { ...snapshot, progress };
            emitChange();
          }
        },
        (phase) => {
          if (snapshot?.id === id && snapshot.status === 'downloading') {
            snapshot = { ...snapshot, phase };
            emitChange();
          }
        },
      )
      .then((info) => {
        if (snapshot?.id === id) {
          snapshot = { ...snapshot, status: 'completed', phase: 'done' };
          emitChange();
          for (const cb of completionCallbacks) cb('binary', info);
          scheduleClear(id);
        }
      })
      .catch((e) => {
        if (snapshot?.id === id) {
          const msg = e instanceof Error ? e.message : String(e);
          snapshot = {
            ...snapshot,
            status: msg === 'Download cancelled' ? 'cancelled' : 'error',
            error: msg === 'Download cancelled' ? null : msg,
          };
          emitChange();
          scheduleClear(id);
        }
      });
  },

  /**
   * Cancel the active download via Rust-side flag.
   */
  async cancel() {
    if (!snapshot || snapshot.status !== 'downloading') return;
    try {
      await invoke('plugin:llamacpp|cancel_download');
    } catch (e) {
      console.warn('[downloadStore] cancel invoke failed:', e);
    }
  },

  /**
   * Register a callback fired when any download completes successfully.
   * Returns an unsubscribe function.
   */
  onComplete(cb: CompletionCallback): () => void {
    completionCallbacks.add(cb);
    return () => completionCallbacks.delete(cb);
  },

  /** Whether a download is currently in progress. */
  isActive(): boolean {
    return snapshot?.status === 'downloading';
  },

  getSnapshot(): ActiveDownload | null {
    return snapshot;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * React hook to subscribe to the active download state.
 * Only triggers re-renders when the snapshot reference changes.
 */
export function useActiveDownload(): ActiveDownload | null {
  return useSyncExternalStore(
    downloadStore.subscribe,
    downloadStore.getSnapshot,
    downloadStore.getSnapshot,
  );
}
