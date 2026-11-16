/** Transformers.js embedding off the main thread: load/embed/embedBatch in, loaded/download/result/error out. */

import type { DataType, ProgressInfo } from '@huggingface/transformers';

const TASK = 'feature-extraction';

let pipelineInstance: any = null;

/** Each file's bytes so far and size; null when sizes can't be learned up front (the bar then shows no percent). */
type Download = Map<string, { loaded: number; total: number }> | null;

/** Sizes every file the pipeline will fetch before the first byte, so the percent never resets between files. */
async function sizeDownload(model: string, dtype: DataType): Promise<Download> {
  const { ModelRegistry } = await import('@huggingface/transformers');
  try {
    const files = await ModelRegistry.get_pipeline_files(TASK, model, { dtype });
    const metadata = await Promise.all(files.map((file) => ModelRegistry.get_file_metadata(model, file)));
    const sized = files.flatMap((file, i) => {
      const { exists, size, fromCache } = metadata[i];
      return exists && size !== undefined ? [[file, { loaded: fromCache ? size : 0, total: size }] as const] : [];
    });
    return sized.length === metadata.filter((m) => m.exists).length ? new Map(sized) : null;
  } catch (error: unknown) {
    console.warn('[EmbeddingWorker] Could not size the download; showing it without a percent:', error);
    return null;
  }
}

/** One file's progress → the whole download's bytes (a file the list missed joins with its own size). */
function reportDownload(download: Download, event: ProgressInfo): void {
  if (event.status !== 'progress') return;
  if (!download) {
    self.postMessage({ type: 'download', loaded: 0, total: null });
    return;
  }
  const file = download.get(event.file) ?? { loaded: 0, total: event.total };
  download.set(event.file, { ...file, loaded: event.loaded });
  let loaded = 0;
  let total = 0;
  for (const f of download.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  self.postMessage({ type: 'download', loaded, total });
}

async function loadPipeline(model: string, dtype: DataType) {
  if (pipelineInstance) return pipelineInstance;

  const { pipeline } = await import('@huggingface/transformers');
  const download = await sizeDownload(model, dtype);

  pipelineInstance = await pipeline(TASK, model, {
    dtype,
    progress_callback: (event: ProgressInfo) => reportDownload(download, event),
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
