/** Proxies embedding to a Web Worker, forwarding download progress; first download is gated on consent. */

import type { EmbeddingService } from './types';
import { NOT_CONSENTED } from './types';
import { requestConsent, hasConsent, revokeConsent } from './consent';
import { emitProgress } from './progress';
import { EMBEDDING_MODEL, EMBEDDING_DTYPE, EMBEDDING_BATCH_SIZE } from './constants';

const EMBEDDING_REQUEST_TIMEOUT_MS = 30_000;
const IDLE_DISPOSE_MS = 5 * 60 * 1000; // 5 minutes

let worker: Worker | null = null;
let ready = false;
let loadPromise: Promise<void> | null = null;
let requestId = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

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

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size === 0 && ready) {
      console.log('[EmbeddingService] Idle timeout — disposing WASM worker to free ~50MB');
      resetPipeline();
    }
  }, IDLE_DISPOSE_MS);
}

function sendRequest(type: 'embed' | 'embedBatch', payload: Record<string, unknown>): Promise<number[][]> {
  const id = ++requestId;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Embedding request ${id} timed out after ${EMBEDDING_REQUEST_TIMEOUT_MS / 1000}s`));
      }
    }, EMBEDDING_REQUEST_TIMEOUT_MS);

    pending.set(id, {
      resolve: (embeddings) => { clearTimeout(timer); resetIdleTimer(); resolve(embeddings); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    w.postMessage({ type, id, model: EMBEDDING_MODEL, dtype: EMBEDDING_DTYPE, ...payload });
  });
}

/** Loads the model; asks consent only when interactive, otherwise denial throws a coded error callers degrade on. */
async function ensureLoaded(opts: { interactive?: boolean } = {}): Promise<void> {
  if (ready) return;
  if (!loadPromise) {
    // Gate on user consent before downloading the model
    if (!hasConsent()) {
      if (!opts.interactive) {
        const err = new Error('Embedding model download not consented') as Error & { code?: string };
        err.code = NOT_CONSENTED;
        throw err;
      }
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
          setEmbeddingReady(true);
          resolve();
        } else if (e.data.type === 'error' && !e.data.id) {
          w.removeEventListener('message', onMsg);
          loadPromise = null;
          setEmbeddingReady(false);
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ type: 'load', model: EMBEDDING_MODEL, dtype: EMBEDDING_DTYPE });
    });
  }
  return loadPromise;
}

async function embed(text: string, opts?: { interactive?: boolean }): Promise<number[]> {
  await ensureLoaded(opts);
  const results = await sendRequest('embed', { text });
  return results[0];
}

async function embedBatch(texts: string[], opts?: { interactive?: boolean }): Promise<number[][]> {
  await ensureLoaded(opts);
  // Process in small batches to avoid WebView memory pressure crashes
  if (texts.length <= EMBEDDING_BATCH_SIZE) {
    return sendRequest('embedBatch', { texts });
  }
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchResults = await sendRequest('embedBatch', { texts: batch });
    results.push(...batchResults);
  }
  return results;
}

function isReady(): boolean {
  return ready;
}

/** Persisted download flag: the model has loaded successfully before. */
const EMBEDDING_READY_KEY = 'rag_model_ready';

export function isEmbeddingReady(): boolean {
  try {
    return localStorage.getItem(EMBEDDING_READY_KEY) === 'ready';
  } catch {
    return ready;
  }
}

function setEmbeddingReady(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(EMBEDDING_READY_KEY, 'ready');
    } else {
      localStorage.removeItem(EMBEDDING_READY_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

/** Downloads/loads the model; background warm-ups must pass `{ interactive: false }` so they never prompt. */
export async function preloadModel(opts: { interactive?: boolean } = {}): Promise<void> {
  await ensureLoaded({ interactive: opts.interactive ?? true });
}

/** Stops the worker and drops the loaded model; requests still waiting on it fail rather than hang. */
export function resetPipeline(): void {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (worker) {
    worker.terminate();
    worker = null;
  }
  loadPromise = null;
  ready = false;
  for (const entry of pending.values()) entry.reject(new Error('Embedding model was unloaded'));
  pending.clear();
}

/** Deletes the downloaded model: consent is withdrawn first so no indexer fetches it again, then its cached files go. */
export async function removeModel(): Promise<void> {
  revokeConsent();
  setEmbeddingReady(false);
  resetPipeline();
  const { ModelRegistry } = await import('@huggingface/transformers');
  await ModelRegistry.clear_pipeline_cache('feature-extraction', EMBEDDING_MODEL, { dtype: EMBEDDING_DTYPE });
}

export const embeddingService: EmbeddingService = {
  embed,
  embedBatch,
  isReady,
};
