/** llama-server model-load and prompt-read progress; a server is recognised once by `build_info` on `GET /props`. */

import { getPlatformFetch } from '@services/platform-fetch';
import { failureLogger } from '@shared/utils/errors';

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
  }
  return known;
}

const percentOf = (done: number, total: number) => Math.min(100, Math.max(0, Math.round((done / total) * 100)));

/** How much of the prompt has been read, from one raw stream chunk; null when the chunk isn't progress. */
export function promptProgressPercent(chunk: unknown): number | null {
  const progress = (chunk as { prompt_progress?: { total?: number; cache?: number; processed?: number } } | null)?.prompt_progress;
  if (!progress?.total) return null;
  const cache = progress.cache ?? 0; // cached tokens need no reading
  const total = progress.total - cache;
  return total > 0 ? percentOf((progress.processed ?? cache) - cache, total) : 100;
}

interface ModelEvent {
  model?: string;
  data?: { status?: string; progress?: { stages?: string[]; current?: string; value?: number } };
}

/** Overall load percent across a model's stages (text model, then vision/audio projector). */
function loadPercent(event: ModelEvent): number | null {
  const progress = event.data?.progress;
  const stages = progress?.stages;
  if (!stages?.length || typeof progress?.value !== 'number') return null;
  const stage = Math.max(0, stages.indexOf(progress.current ?? ''));
  return percentOf(stage + progress.value, stages.length);
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

/**
 * Reports `model`'s load percent while llama-server loads it; stops once it's
 * loaded or failed, or when the returned function is called.
 */
export function followModelLoad(baseUrl: string, model: string, onPercent: (percent: number) => void): () => void {
  const controller = new AbortController();
  const follow = async () => {
    const response = await getPlatformFetch()(`${rootOf(baseUrl)}/models/sse`, { signal: controller.signal });
    if (!response.ok || !response.body) return;
    for await (const event of sseEvents(response.body) as AsyncGenerator<ModelEvent>) {
      if (event.model !== model) continue;
      const status = event.data?.status;
      if (status === 'loaded' || status === 'failed') break;
      const percent = loadPercent(event);
      if (percent !== null) onPercent(percent);
    }
    controller.abort();
  };
  follow().catch((error: unknown) => {
    if (!controller.signal.aborted) report('follow model load')(error);
  });
  return () => controller.abort();
}
