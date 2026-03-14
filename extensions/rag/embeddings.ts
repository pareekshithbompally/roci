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

let pipelineInstance: any = null;
let loading = false;
let ready = false;

async function getPipeline() {
  if (pipelineInstance) return pipelineInstance;
  if (loading) {
    // Wait for the in-flight load to complete
    while (loading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!pipelineInstance) throw new Error('Model failed to load');
    return pipelineInstance;
  }

  // Gate on user consent before downloading the model
  if (!hasConsent()) {
    const granted = await requestConsent();
    if (!granted) {
      throw new Error('User declined embedding model download');
    }
  }

  loading = true;
  try {
    const { pipeline } = await import('@huggingface/transformers');

    pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (event: any) => {
        switch (event.status) {
          case 'initiate':
          case 'download':
            emitProgress({ status: 'downloading', file: event.file, percent: 0 });
            break;
          case 'progress':
            emitProgress({
              status: 'downloading',
              file: event.file,
              loaded: event.loaded,
              total: event.total,
              percent: Math.round(event.progress ?? 0),
            });
            break;
          case 'done':
            emitProgress({ status: 'loading', file: event.file });
            break;
          case 'ready':
            emitProgress({ status: 'ready' });
            break;
        }
      },
    });

    ready = true;
    console.log('[EmbeddingService] Model loaded successfully');
  } catch (error: any) {
    console.error('[EmbeddingService] Failed to load model:', error);
    emitProgress({ status: 'error', error: error.message || 'Failed to load model' });
    throw error;
  } finally {
    loading = false;
  }
  return pipelineInstance;
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getPipeline();
  const results: number[][] = [];
  // Process one at a time to avoid OOM with large batches
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    results.push(Array.from(output.data as Float32Array));
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
  ready = false;
  loading = false;
}

export const embeddingService: EmbeddingService = {
  embed,
  embedBatch,
  isReady,
};
