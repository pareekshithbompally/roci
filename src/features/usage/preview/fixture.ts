/** Dev-only: a month of usage shaped like real use, with every case the Usage screen must handle — more models than a donut
 *  names (so "+N more"), a long model id, paid, unpriced and free models, a use case recorded under an older name, tools,
 *  and quiet days. Totals are summed from the rows, as the store sums them. */

import type { ModelUseCase, ProviderModelBreakdown, ToolBreakdown, UsageBucket, UsageBucketPart, UsageQuery, UsageSummary } from '@extensions/usage';
import { addDays, localDayKey, startOfDay } from '@shared/utils/localDate';

const model = (provider: string, name: string, calls: number, input: number, cached: number, output: number, cost: number, unpriced = 0): ProviderModelBreakdown => ({
  provider, model: name, calls, input_tokens: input, output_tokens: output, cache_read_tokens: cached, cache_write_tokens: 0,
  reasoning_tokens: 0, estimated_cost: cost, unpriced_calls: unpriced, audio_seconds: 0,
});

const MODELS: ProviderModelBreakdown[] = [
  model('gemini', 'gemini-3.5-flash-lite', 93, 151_297, 13_824, 22_410, 0.0702),
  model('openrouter', 'anthropic/claude-sonnet-4.5-thinking-preview', 6, 40_120, 31_000, 3_900, 0.0391),
  model('ollama', 'gemma4:31b-cloud', 22, 79_017, 36_469, 9_870, 0.0045),
  model('gemini', 'gemini-3.5-transcribe', 9, 12_300, 0, 4_100, 0, 9),
  model('apple-intelligence', 'apple-intelligence', 12, 0, 0, 0, 0),
  model('on-device', 'mlx-community/gemma-4-e2b', 9, 4_168, 0, 1_200, 0),
  model('local:ollama', 'llama3.2:3b', 14, 22_000, 0, 5_400, 0),
  model('local:localhost:9931', 'qwen3-8b', 10, 16_084, 4_786, 3_100, 0),
  model('on-device', 'mlx-community/parakeet-tdt-0.6b', 4, 0, 0, 0, 0),
];

const CATEGORIES = [
  { category: 'chat', calls: 96, cost: 0.0821 },
  { category: 'summary', calls: 21, cost: 0.0192 },
  { category: 'liveNotes', calls: 11, cost: 0.0032 },
  { category: 'transcription', calls: 14, cost: 0, unpriced: 9 },
];

const TOOLS: ToolBreakdown[] = [
  { tool: 'web_search_exa', calls: 11, failed: 0, avg_ms: 1525, last_used: Date.now() - 3_600_000 },
  { tool: 'find', calls: 7, failed: 1, avg_ms: 171, last_used: Date.now() - 86_400_000 },
  { tool: 'read', calls: 7, failed: 0, avg_ms: 4, last_used: Date.now() - 2 * 86_400_000 },
  { tool: 'generate_image', calls: 3, failed: 0, avg_ms: 8031, last_used: Date.now() - 5 * 86_400_000 },
  { tool: 'server:GOOGLE_SEARCH_WEB', calls: 3, failed: 0, avg_ms: null, last_used: Date.now() - 6 * 86_400_000 },
];

/** Busy days in the last two weeks, quiet before. */
const ACTIVE: Array<[daysAgo: number, calls: number, cost: number]> = [[13, 4, 0.002], [9, 12, 0.006], [6, 8, 0.004], [3, 41, 0.028], [2, 52, 0.037], [1, 30, 0.006], [0, 32, 0.0031]];

function trend(now: Date): UsageBucket[] {
  return ACTIVE.map(([ago, calls, cost]) => ({
    key: localDayKey(addDays(startOfDay(now), -ago)), calls, input_tokens: calls * 1_900, output_tokens: calls * 310, cache_read_tokens: calls * 420, estimated_cost: cost,
  }));
}

const sum = <T,>(rows: T[], of: (r: T) => number) => rows.reduce((n, r) => n + of(r), 0);

/** Each day's totals spread over `shares` (key → its share of calls and of cost), as the store splits a bucket. */
function spread(days: UsageBucket[], shares: Array<{ part: string; calls: number; cost: number }>): UsageBucketPart[] {
  const calls = sum(shares, (s) => s.calls) || 1;
  const cost = sum(shares, (s) => s.cost) || 1;
  return days.flatMap((day) => shares.map((s) => ({
    key: day.key,
    part: s.part,
    calls: Math.round((day.calls * s.calls) / calls),
    tokens: Math.round(((day.input_tokens + day.output_tokens) * s.calls) / calls),
    estimated_cost: (day.estimated_cost * s.cost) / cost,
  })).filter((p) => p.calls > 0 || p.estimated_cost > 0));
}

/** What each model ran for: speech models transcribe, the rest share chat, summaries and live notes. */
function modelUseCases(models: ProviderModelBreakdown[]): ModelUseCase[] {
  return models.flatMap((m) => {
    const uses = m.model.includes('transcribe') || m.model.includes('parakeet') ? ['transcription'] : m.calls > 50 ? ['chat', 'summary', 'liveNotes'] : ['chat', 'summary'];
    return uses.map((category, i) => {
      const weight = uses.length === 1 ? 1 : [0.7, 0.2, 0.1][i] / (uses.length === 2 ? 0.9 : 1);
      return { provider: m.provider, model: m.model, category, calls: Math.round(m.calls * weight), tokens: Math.round((m.input_tokens + m.output_tokens) * weight), estimated_cost: m.estimated_cost * weight };
    });
  });
}

/** The summary the store would return for `query`: this month, or (a window ending before today) a quieter one before it. */
export function usageSummary(query: UsageQuery): UsageSummary {
  const earlier = query.until !== undefined && query.until <= startOfDay(new Date()).getTime();
  const scale = earlier ? 0.6 : 1;
  const models = MODELS.map((m) => ({ ...m, calls: Math.round(m.calls * scale), estimated_cost: m.estimated_cost * scale }));
  const days = query.bucket ? trend(new Date()) : [];
  return {
    total_cost: sum(models, (m) => m.estimated_cost),
    total_input_tokens: sum(models, (m) => m.input_tokens),
    total_output_tokens: sum(models, (m) => m.output_tokens),
    total_cache_read_tokens: sum(models, (m) => m.cache_read_tokens),
    total_calls: sum(models, (m) => m.calls),
    unpriced_calls: sum(models, (m) => m.unpriced_calls),
    first_timestamp: addDays(new Date(), -13).getTime(),
    by_provider_model: models,
    by_category: CATEGORIES.map((c) => ({ category: c.category, calls: c.calls, input_tokens: 0, output_tokens: 0, estimated_cost: c.cost, unpriced_calls: c.unpriced ?? 0 })),
    by_tool: TOOLS,
    trend: days,
    trend_by_model: spread(days, models.map((m) => ({ part: `${m.provider}/${m.model}`, calls: m.calls, cost: m.estimated_cost }))),
    trend_by_use_case: spread(days, CATEGORIES.map((c) => ({ part: c.category, calls: c.calls, cost: c.cost }))),
    by_model_use_case: modelUseCases(models),
  };
}
