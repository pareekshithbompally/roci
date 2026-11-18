/** llama-server: what it reports about its models, their load and prompt-read progress; recognised once by `build_info` on `GET /props`. */

import { getPlatformFetch } from '@services/platform-fetch';
import { failureLogger } from '@shared/utils/errors';
import { LLAMA_THINKING_BUDGET_TOKENS, LLAMA_THINKING_TEMPLATE, MODEL_LOAD_PART_SHARE, PROMPT_ETA_MIN_ELAPSED_MS } from '@config/localServers.config';
import type { ReasoningEffort } from '@shared/types';
import type { ServedModelInfo } from '@shared/types/modelProviders';
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

/** One model as llama-server's `/models` describes it (router mode); every field optional. */
interface LlamaModelEntry {
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  context_length?: number;
  status?: { value?: string; preset?: string };
}

/** The `ctx-size = N` line of a model's preset: the context it actually runs with. */
const presetContext = (preset: string | undefined) => Number(preset?.match(/^ctx-size\s*=\s*(\d+)\s*$/m)?.[1]) || undefined;

/** What llama-server's model list says about one model: its modalities and its running context (preset, else its maximum). */
export function servedModelInfo(entry: unknown): ServedModelInfo {
  const model = entry as LlamaModelEntry;
  const input = model.architecture?.input_modalities;
  return {
    ...(input && { modalities: { input, output: model.architecture?.output_modalities ?? [] } }),
    contextTokens: presetContext(model.status?.preset) ?? model.context_length,
  };
}

/** Whether a chat template thinks, by llama-server's own web UI rule (`LLAMA_THINKING_TEMPLATE`). */
export function templateThinks(template: string): boolean {
  const { variables, conditionals, markers } = LLAMA_THINKING_TEMPLATE;
  const inExpression = (name: string) =>
    new RegExp(`(\\{\\{[^{}]*\\b${name}\\b[^{}]*\\}\\}|\\{%[^{}]*\\b${name}\\b[^{}]*%\\})`, 'i').test(template);
  return variables.some(inExpression)
    || conditionals.some((pattern) => pattern.test(template))
    || markers.some(([open, close]) => template.includes(open) && (close === null || template.includes(close)));
}

interface LlamaModelProps {
  chat_template?: string;
  chat_template_caps?: { supports_tools?: boolean };
}

/**
 * What a loaded model's chat template can do (tools, thinking), from `GET /props?model=…&autoload=false`.
 * `autoload=false` means this never loads a model; a model that isn't loaded answers 400 and gives null.
 */
export async function fetchTemplateCapabilities(baseUrl: string, model: string): Promise<Pick<ServedModelInfo, 'tools' | 'thinking'> | null> {
  const query = new URLSearchParams({ model, autoload: 'false' });
  const response = await getPlatformFetch()(`${rootOf(baseUrl)}/props?${query}`);
  if (!response.ok) return null;
  const props = (await response.json()) as LlamaModelProps;
  return {
    tools: props.chat_template_caps?.supports_tools === true,
    thinking: templateThinks(props.chat_template ?? ''),
  };
}

/** Whether llama-server has this model loaded now (router mode); others are loaded on first use, unloading the current one. */
export const isModelLoaded = (entry: unknown) => (entry as LlamaModelEntry).status?.value === 'loaded';

/**
 * llama-server's own request fields: its progress (`return_progress`, `timings_per_token`) and the chat's
 * thinking budget (`thinking_budget_tokens`). Turning thinking off travels as the SDK's `reasoning_effort: "none"`.
 */
export function llamaServerRequestBody(effort: ReasoningEffort) {
  const budget = LLAMA_THINKING_BUDGET_TOKENS[effort];
  return (body: Record<string, unknown>) => ({
    ...body,
    return_progress: true,
    timings_per_token: true,
    ...(budget !== undefined && { thinking_budget_tokens: budget }),
  });
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
  const timings = (chunk as { timings?: { predicted_n?: number; predicted_ms?: number; predicted_per_second?: number } } | null)?.timings;
  if (!timings?.predicted_n) return null;
  return { tokens: timings.predicted_n, elapsedMs: timings.predicted_ms ?? 0, tokensPerSecond: timings.predicted_per_second ?? 0 };
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

/** Reports a model's load stage and rising percent until it's loaded, fails, or the returned stop function is called. */
export function followModelLoad(baseUrl: string, model: string, onProgress: (progress: StreamProgress) => void): () => void {
  const controller = new AbortController();
  let reported = -1;
  const follow = async () => {
    const response = await getPlatformFetch()(`${rootOf(baseUrl)}/models/sse`, { signal: controller.signal });
    if (!response.ok || !response.body) return;
    for await (const event of sseEvents(response.body) as AsyncGenerator<ModelEvent>) {
      if (event.model !== model) continue;
      const status = event.data?.status;
      if (status === 'loaded' || status === 'failed') break;
      const progress = loadProgress(event);
      // Only forward: a lower or repeated value would step the bar back or re-render for nothing.
      if (!progress || (progress.percent ?? 0) <= reported) continue;
      reported = progress.percent ?? 0;
      onProgress(progress);
    }
    controller.abort();
  };
  follow().catch((error: unknown) => {
    if (!controller.signal.aborted) report('follow model load')(error);
  });
  return () => controller.abort();
}
