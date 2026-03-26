/**
 * Local Embedding Service
 *
 * Proxies embedding requests to a Web Worker running Transformers.js WASM.
 * This keeps the main thread free for CSS animations, React renders, and
 * user interaction during indexing.
 *
 * Model download progress is forwarded from the worker via emitProgress().
 * Gated behind user consent before first download.
 */

import type { EmbeddingService } from './types';
import { requestConsent, hasConsent } from './consent';
import { emitProgress } from './progress';
import { EMBEDDING_MODEL, EMBEDDING_DTYPE } from './constants';

let worker: Worker | null = null;
let ready = false;
let loadPromise: Promise<void> | null = null;
let requestId = 0;

/** Pending request resolvers keyed by request ID */
const pending = new Map<number, {
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(
    new URL('./embedding.worker.ts', import.meta.url),
    { type: 'module' },
  );

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;

    switch (msg.type) {
      case 'loaded':
        ready = true;
        console.log('[EmbeddingService] Model loaded in worker');
        break;

      case 'progress':
        // Forward model download progress to the UI bridge
        switch (msg.status) {
          case 'initiate':
          case 'download':
            emitProgress({ kind: 'model', status: 'downloading', file: msg.file, percent: 0 });
            break;
          case 'progress':
            emitProgress({
              kind: 'model',
              status: 'downloading',
              file: msg.file,
              loaded: msg.loaded,
              total: msg.total,
              percent: Math.round(msg.progress ?? 0),
            });
            break;
          case 'done':
            emitProgress({ kind: 'model', status: 'loading', file: msg.file });
            break;
          case 'ready':
            emitProgress({ kind: 'model', status: 'ready' });
            break;
        }
        break;

      case 'result': {
        const entry = pending.get(msg.id);
        if (entry) {
          pending.delete(msg.id);
          entry.resolve(msg.embeddings);
        }
        break;
      }

      case 'error': {
        if (msg.id != null) {
          const entry = pending.get(msg.id);
          if (entry) {
            pending.delete(msg.id);
            entry.reject(new Error(msg.message));
          }
        } else {
          console.error('[EmbeddingService] Worker error:', msg.message);
          emitProgress({ kind: 'model', status: 'error', error: msg.message });
        }
        break;
      }
    }
  };

  worker.onerror = (e) => {
    console.error('[EmbeddingService] Worker uncaught error:', e);
    // Reject all pending requests
    for (const [id, entry] of pending) {
      entry.reject(new Error('Worker crashed'));
      pending.delete(id);
    }
  };

  return worker;
}

function sendRequest(type: 'embed' | 'embedBatch', payload: Record<string, unknown>): Promise<number[][]> {
  const id = ++requestId;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type, id, model: EMBEDDING_MODEL, dtype: EMBEDDING_DTYPE, ...payload });
  });
}

async function ensureLoaded(): Promise<void> {
  if (ready) return;
  if (!loadPromise) {
    // Gate on user consent before downloading the model
    if (!hasConsent()) {
      const granted = await requestConsent();
      if (!granted) {
        throw new Error('User declined embedding model download');
      }
    }
    loadPromise = new Promise<void>((resolve, reject) => {
      const w = getWorker();
      const onMsg = (e: MessageEvent) => {
        if (e.data.type === 'loaded') {
          w.removeEventListener('message', onMsg);
          resolve();
        } else if (e.data.type === 'error' && !e.data.id) {
          w.removeEventListener('message', onMsg);
          loadPromise = null;
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'load', model: EMBEDDING_MODEL, dtype: EMBEDDING_DTYPE });
    });
  }
  return loadPromise;
}

async function embed(text: string): Promise<number[]> {
  await ensureLoaded();
  const results = await sendRequest('embed', { text });
  return results[0];
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  await ensureLoaded();
  return sendRequest('embedBatch', { texts });
}

function isReady(): boolean {
  return ready;
}

/** Trigger model download/load without needing to embed anything */
export async function preloadModel(): Promise<void> {
  await ensureLoaded();
}

/** Clear cached pipeline so the next call re-downloads. Used for retry. */
export function resetPipeline(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  loadPromise = null;
  ready = false;
  pending.clear();
}

export const embeddingService: EmbeddingService = {
  embed,
  embedBatch,
  isReady,
};
