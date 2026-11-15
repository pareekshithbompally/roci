/** Transformers.js embedding off the main thread: load/embed/embedBatch in, loaded/progress/result/error out. */

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
