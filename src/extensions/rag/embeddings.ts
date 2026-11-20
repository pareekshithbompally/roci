/** Search embeddings from the on-device embedding model (MLX, through the AI SDK), once it's downloaded. */

import { embedMany } from 'ai';
import { createLocalEmbeddingModel } from '@services/ai/provider';
import { getLocalModels, type LocalErrorPayload } from '@services/localModels.service';
import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL_ID, EMBEDDING_PREFIX } from './constants';
import { vectorDB } from './client';

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

/** Search queries' vectors, in order, in one call. */
export function embedQueries(texts: string[]): Promise<number[][]> {
  return embedAll(texts.map((text) => EMBEDDING_PREFIX.query + text));
}

/** A search query's vector. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedQueries([text]);
  return vector;
}

/** Vectors of indexed text (meeting and chat chunks), in order. */
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embedAll(texts.map((text) => EMBEDDING_PREFIX.document + text));
}

/** What an index save embeds: only the pieces without a vector yet (an unchanged piece keeps its own). `complete` when every
 *  piece has one afterwards; nothing is embedded when `include` is off or the model isn't downloaded. Meetings and chats alike. */
export async function newVectors(
  owner: 'meeting' | 'chat',
  id: string,
  texts: string[],
  include = true,
): Promise<{ vectors: Map<string, number[]>; complete: boolean }> {
  const vectors = new Map<string, number[]>();
  if (!include) return { vectors, complete: false };
  const have = new Set(await vectorDB.getEmbeddedChunkTexts(owner, id));
  const missing = [...new Set(texts.filter((text) => !have.has(text)))];
  if (missing.length === 0) return { vectors, complete: true };
  try {
    (await embedDocuments(missing)).forEach((vector, i) => vectors.set(missing[i], vector));
  } catch (error: unknown) {
    if (!isEmbeddingMissing(error)) console.error(`[Embeddings] Embedding ${owner} ${id} failed:`, error);
  }
  return { vectors, complete: vectors.size === missing.length };
}
