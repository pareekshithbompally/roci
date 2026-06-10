/**
 * Embedding Web Worker
 *
 * Runs Transformers.js WASM inference off the main thread so CSS animations,
 * React renders, and user interaction stay responsive during indexing.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { type: 'load', model, dtype }          — load/preload the model
 *     { type: 'embed', id, text }             — embed a single text
 *     { type: 'embedBatch', id, texts }       — embed a batch of texts
 *
 *   Worker → Main:
 *     { type: 'loaded' }                      — model is ready
 *     { type: 'progress', ...progressData }   — model download progress
 *     { type: 'result', id, embeddings }      — embedding result (single or batch)
 *     { type: 'error', id?, message }         — error (id present = per-request)
 */

import type { DataType } from '@huggingface/transformers';

let pipelineInstance: any = null;

async function loadPipeline(model: string, dtype: DataType) {
  if (pipelineInstance) return pipelineInstance;

  const { pipeline } = await import('@huggingface/transformers');

  pipelineInstance = await pipeline('feature-extraction', model, {
    dtype,
    progress_callback: (event: any) => {
      self.postMessage({ type: 'progress', ...event });
    },
  });

  return pipelineInstance;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case 'load': {
        await loadPipeline(msg.model, msg.dtype);
        self.postMessage({ type: 'loaded' });
        break;
      }

      case 'embed': {
        const extractor = await loadPipeline(msg.model, msg.dtype);
        const output = await extractor(msg.text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data as Float32Array);
        self.postMessage({ type: 'result', id: msg.id, embeddings: [embedding] });
        break;
      }

      case 'embedBatch': {
        const extractor = await loadPipeline(msg.model, msg.dtype);
        const output = await extractor(msg.texts as string[], { pooling: 'mean', normalize: true });
        const results: number[][] = output.tolist() as number[][];
        output.dispose();
        self.postMessage({ type: 'result', id: msg.id, embeddings: results });
        break;
      }
    }
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      message: error?.message || 'Worker embedding failed',
    });
  }
};
