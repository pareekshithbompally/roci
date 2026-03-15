/**
 * Local Embedding Service
 *
 * Uses Transformers.js to run Xenova/all-MiniLM-L6-v2 locally in the browser.
 * Model is ~23MB, downloaded once and cached by the browser Cache API.
 * Gated behind user consent before first download.
 *
 * Reports all progress events faithfully via emitProgress().
 * The UI layer (ModelDownloadModal) decides what to surface to the user.
 */

import type { EmbeddingService } from './types';
import { requestConsent, hasConsent } from './consent';
import { emitProgress } from './progress';
import { EMBEDDING_MODEL, EMBEDDING_DTYPE, EMBEDDING_BATCH_SIZE } from './constants';

let pipelineInstance: any = null;
let loadPromise: Promise<any> | null = null;
let ready = false;

async function getPipeline() {
  if (pipelineInstance) return pipelineInstance;
  if (!loadPromise) {
    loadPromise = loadPipeline();
  }
  return loadPromise;
}

async function loadPipeline() {
  // Gate on user consent before downloading the model
  if (!hasConsent()) {
    const granted = await requestConsent();
    if (!granted) {
      throw new Error('User declined embedding model download');
    }
  }

  try {
    const { pipeline } = await import('@huggingface/transformers');

    pipelineInstance = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: EMBEDDING_DTYPE,
      progress_callback: (event: any) => {
        switch (event.status) {
          case 'initiate':
          case 'download':
            emitProgress({ kind: 'model', status: 'downloading', file: event.file, percent: 0 });
            break;
          case 'progress':
            emitProgress({
              kind: 'model',
              status: 'downloading',
              file: event.file,
              loaded: event.loaded,
              total: event.total,
              percent: Math.round(event.progress ?? 0),
            });
            break;
          case 'done':
            emitProgress({ kind: 'model', status: 'loading', file: event.file });
            break;
          case 'ready':
            emitProgress({ kind: 'model', status: 'ready' });
            break;
        }
      },
    });

    ready = true;
    console.log('[EmbeddingService] Model loaded successfully');
    return pipelineInstance;
  } catch (error: any) {
    loadPromise = null;  // Reset on failure so retry works
    console.error('[EmbeddingService] Failed to load model:', error);
    emitProgress({ kind: 'model', status: 'error', error: error.message || 'Failed to load model' });
    throw error;
  }
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getPipeline();
  const results: number[][] = [];

  // Process in batches to balance throughput vs memory
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    for (const text of batch) {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }
  }

  return results;
}

function isReady(): boolean {
  return ready;
}

/** Trigger model download/load without needing to embed anything */
export async function preloadModel(): Promise<void> {
  await getPipeline();
}

/** Clear cached pipeline so the next call re-downloads. Used for retry. */
export function resetPipeline(): void {
  pipelineInstance = null;
  loadPromise = null;
  ready = false;
}

export const embeddingService: EmbeddingService = {
  embed,
  embedBatch,
  isReady,
};
