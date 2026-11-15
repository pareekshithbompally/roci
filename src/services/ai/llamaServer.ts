/** llama-server model-load and prompt-read progress; a server is recognised once by `build_info` on `GET /props`. */

import { getPlatformFetch } from '@services/platform-fetch';
import { failureLogger } from '@shared/utils/errors';
import { MODEL_LOAD_PART_SHARE, PROMPT_ETA_MIN_ELAPSED_MS } from '@config/localServers.config';
import type { GenerationStats, StreamProgress } from './types';

const report = failureLogger('llamaServer');

/** The server root: the OpenAI-compatible base URL without its `/v1`. */
const rootOf = (baseUrl: string) => baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');

const recognised = new Map<string, Promise<boolean>>();

/** Whether `baseUrl` is served by llama-server; a yes is remembered per address, a no (or no answer) is asked again next time. */
export function isLlamaServer(baseUrl: string): Promise<boolean> {
  const root = rootOf(baseUrl);
  let known = recognised.get(root);
  if (!known) {
    known = getPlatformFetch()(`${root}/props`)
      .then((response) => (response.ok ? response.json() : null))
      .then((props: { build_info?: unknown } | null) => typeof props?.build_info === 'string')
      .catch(() => false);
    recognised.set(root, known);
    void known.then((isServer) => isServer || recognised.delete(root));
  }
  return known;
}

const percentOf = (done: number, total: number) => Math.min(100, Math.max(0, Math.round((done / total) * 100)));

/** Seconds left at the pace so far; undefined until some of the prompt is read and enough time has passed to tell. */
function secondsLeftOf(done: number, total: number, elapsedMs: number): number | undefined {
  if (done <= 0 || done >= total || elapsedMs < PROMPT_ETA_MIN_ELAPSED_MS) return undefined;
  return Math.ceil((elapsedMs / 1000) * (total / done - 1));
}

interface PromptProgress { total?: number; cache?: number; processed?: number; time_ms?: number }

/** How much of the prompt has been read and the time left, from one raw stream chunk; null when the chunk isn't progress. */
export function promptProgress(chunk: unknown): StreamProgress | null {
  const progress = (chunk as { prompt_progress?: PromptProgress } | null)?.prompt_progress;
  if (!progress?.total) return null;
  const cache = progress.cache ?? 0; // cached tokens need no reading
  const total = progress.total - cache;
  if (total <= 0) return { stage: 'reading-prompt', percent: 100 };
  const done = (progress.processed ?? cache) - cache;
  return { stage: 'reading-prompt', percent: percentOf(done, total), secondsLeft: secondsLeftOf(done, total, progress.time_ms ?? 0) };
}

/** Tokens generated so far and the speed, from one raw stream chunk; null before the first token. */
export function generationStats(chunk: unknown): GenerationStats | null {
  const timings = (chunk as { timings?: { predicted_n?: number; predicted_per_second?: number } } | null)?.timings;
  if (!timings?.predicted_n) return null;
  return { tokens: timings.predicted_n, tokensPerSecond: timings.predicted_per_second ?? 0 };
}

interface ModelEvent {
  model?: string;
  data?: { status?: string; progress?: { stages?: string[]; current?: string; value?: number } };
}

/** The server's load stages, as the reply header names them. */
const LOAD_STAGES: Record<string, StreamProgress['stage']> = {
  text_model: 'loading-weights',
  spec_model: 'loading-draft',
  mmproj_model: 'loading-projector',
};

/** The stage being loaded and the overall percent: the main weights fill all but one share per later part (draft, projector). */
function loadProgress(event: ModelEvent): StreamProgress | null {
  const progress = event.data?.progress;
  const stage = LOAD_STAGES[progress?.current ?? ''];
  if (!stage || typeof progress?.value !== 'number') return null;
  const stages = progress.stages ?? [];
  const weightsShare = 1 - Math.max(stages.length - 1, 0) * MODEL_LOAD_PART_SHARE;
  const index = stages.indexOf(progress.current ?? '');
  const done = index <= 0
    ? progress.value * weightsShare
    : weightsShare + (index - 1 + progress.value) * MODEL_LOAD_PART_SHARE;
  return { stage, percent: percentOf(done, 1) };
}

/** Each `data:` line's JSON in a stream of server-sent events. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    const lines = (pending + value).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) yield JSON.parse(line.slice('data:'.length));
    }
  }
}

/** Reports a model's load stage and percent until it's loaded, fails, or the returned stop function is called. */
export function followModelLoad(baseUrl: string, model: string, onProgress: (progress: StreamProgress) => void): () => void {
  const controller = new AbortController();
  const follow = async () => {
    const response = await getPlatformFetch()(`${rootOf(baseUrl)}/models/sse`, { signal: controller.signal });
    if (!response.ok || !response.body) return;
    for await (const event of sseEvents(response.body) as AsyncGenerator<ModelEvent>) {
      if (event.model !== model) continue;
      const status = event.data?.status;
      if (status === 'loaded' || status === 'failed') break;
      const progress = loadProgress(event);
      if (progress) onProgress(progress);
    }
    controller.abort();
  };
  follow().catch((error: unknown) => {
    if (!controller.signal.aborted) report('follow model load')(error);
  });
  return () => controller.abort();
}
