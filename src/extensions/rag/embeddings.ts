/** Search embeddings from the on-device embedding model (MLX, through the AI SDK), once it's downloaded. */

import { embedMany } from 'ai';
import { createLocalEmbeddingModel } from '@services/ai/provider';
import { getLocalModels, type LocalErrorPayload } from '@services/localModels.service';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL_ID, EMBEDDING_PREFIX } from './constants';

/** True when the model is downloaded, so indexing can add vectors. */
export async function isEmbeddingAvailable(): Promise<boolean> {
  const models = await getLocalModels();
  return models.some((m) => m.id === EMBEDDING_MODEL_ID && m.installed);
}

/** The model isn't downloaded: search stays full-text, which is expected, not a failure. */
export function isEmbeddingMissing(error: unknown): boolean {
  return (error as Partial<LocalErrorPayload> | null)?.code === 'not-downloaded';
}

/** Small batches bound the memory one call takes; a local model has nothing to retry. */
async function embedAll(values: string[]): Promise<number[][]> {
  const model = createLocalEmbeddingModel(EMBEDDING_MODEL_ID);
  const vectors: number[][] = [];
  for (let i = 0; i < values.length; i += EMBEDDING_BATCH_SIZE) {
    const { embeddings } = await embedMany({ model, values: values.slice(i, i + EMBEDDING_BATCH_SIZE), maxRetries: 0 });
    vectors.push(...embeddings);
  }
  return vectors;
}

/** A search query's vector. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedAll([EMBEDDING_PREFIX.query + text]);
  return vector;
}

/** Vectors of indexed text (meeting and chat chunks), in order. */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embedAll(texts.map((text) => EMBEDDING_PREFIX.document + text));
}
