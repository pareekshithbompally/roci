/** Usage logging and queries via Tauri; logging is fire-and-forget. */

import { isTauriEnvironment } from '@services/tauri';
import type { TokenUsage } from '@services/ai/types';
import type { ModelPrice } from '@shared/types/modelProviders';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { modalitiesService } from '@services/modalities';
import { costOf, priceOf } from './pricing';
import { store } from '@services/db';
import type { UsageRecord, UsageCategory, UsageQuery, UsageSummary } from './types';

/** Logs a usage record, mapping TokenUsage and audio length to the flat UsageRecord Rust expects; priced by the one price rule. */
export async function logUsage(params: {
  category: UsageCategory;
  sessionId?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  /** Audio a speech call heard or spoke, in seconds. */
  audioSeconds?: number;
}): Promise<void> {
  if (!isTauriEnvironment()) return;
  if (!params.provider || !params.model) return;
  await modalitiesService.ensureLoaded();
  const price = priceOf(await store.providers.list(), params.provider, params.model);

  const record: UsageRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    category: params.category,
    session_id: params.sessionId,
    provider: params.provider,
    model: params.model,
    input_tokens: params.usage?.inputTokens ?? 0,
    output_tokens: params.usage?.outputTokens ?? 0,
    cache_read_tokens: params.usage?.cacheReadTokens ?? 0,
    cache_write_tokens: params.usage?.cacheWriteTokens ?? 0,
    reasoning_tokens: params.usage?.reasoningTokens ?? 0,
    estimated_cost: costOf(price, params.usage, params.audioSeconds),
    audio_seconds: params.audioSeconds,
  };

  try {
    await store.usage.insert(record);
    // Only what this call changes reads again: the usage totals and its own session's calls.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.usageSummaries() }),
      record.session_id && queryClient.invalidateQueries({ queryKey: queryKeys.sessionUsage(record.session_id) }),
    ]);
  } catch (error) {
    console.error('[UsageClient] insert_usage failed:', error, '| record:', JSON.stringify({ category: record.category, provider: record.provider, model: record.model }));
  }
}

/** A call saved without a price (Rust `UnpricedUsageRow`). */
interface UnpricedUsage {
  id: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  audio_seconds: number;
}

/** What a saved call used, as `costOf` takes it: no tokens means it was billed by its audio alone, as when it was logged. */
function tokenUsageOf(row: UnpricedUsage): TokenUsage | undefined {
  if (row.input_tokens + row.output_tokens === 0) return undefined;
  return { inputTokens: row.input_tokens, outputTokens: row.output_tokens, cacheReadTokens: row.cache_read_tokens, cacheWriteTokens: row.cache_write_tokens };
}

/** Prices a model's earlier calls saved without a price, at the price the user just set, by the same `costOf` every call is
 *  logged with; a call the price can't bill (audio without a per-minute rate) stays unknown. Open usage pages update. */
export async function priceUnpricedUsage(provider: string, model: string, price: ModelPrice): Promise<void> {
  if (!isTauriEnvironment()) return;
  const rows = await store.usage.unpriced<UnpricedUsage>(provider, model);
  const costs = rows.flatMap((row) => {
    const cost = costOf(price, tokenUsageOf(row), row.audio_seconds);
    return cost === undefined ? [] : [{ id: row.id, cost }];
  });
  if (costs.length === 0) return;
  await store.usage.setCosts(costs);
  await queryClient.invalidateQueries({ queryKey: queryKeys.usageAll() });
}

/** Which model a call ran on: a resolved chat/summary model or a speech selection. */
export interface UsageSource {
  provider: string;
  modelId: string;
}

/** Records one AI call's tokens and audio length; a logging failure never reaches the caller. */
export function recordUsage(category: UsageCategory, source: UsageSource, usage: TokenUsage | undefined, sessionId?: string, audioSeconds?: number): void {
  logUsage({ category, sessionId, provider: source.provider, model: source.modelId, usage, audioSeconds })
    .catch((error: unknown) => console.error(`[Usage] ${category}:`, error));
}

/** Usage summed over a query's window and filters, with per-bucket totals when it asks for them. */
export async function getUsageSummary(query: UsageQuery): Promise<UsageSummary> {
  if (!isTauriEnvironment()) {
    return {
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_calls: 0,
      unpriced_calls: 0,
      first_timestamp: null,
      by_provider_model: [],
      by_category: [],
      by_tool: [],
      trend: [],
      trend_by_model: [],
      trend_by_use_case: [],
      by_model_use_case: [],
    };
  }

  return store.usage.summary<UsageSummary>(query);
}

/** One AI call made for a session, a meeting or a dictation (Rust `SessionUsageRow`), newest first. */
export interface SessionUsage {
  category: UsageCategory;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  /** Null when the call's price is unknown. */
  estimated_cost: number | null;
  /** Audio a speech call heard or spoke, in seconds. */
  audio_seconds: number;
  timestamp: number;
}

/** The AI calls made for one session (its usage rows carry the meeting or dictation id). */
export async function getSessionUsage(sessionId: string): Promise<SessionUsage[]> {
  if (!isTauriEnvironment()) return [];
  return store.usage.sessionCalls<SessionUsage>(sessionId);
}

/** What some calls cost, as each was priced when logged (a price set later fills the unpriced ones): the USD total of the
 *  priced ones and how many have no price. */
export interface SessionCost {
  total: number;
  unpriced: number;
}

/** The one cost rule meetings and dictations read; null when there are no calls. */
export function sessionCostOf(usage: readonly SessionUsage[]): SessionCost | null {
  if (usage.length === 0) return null;
  return {
    total: usage.reduce((sum, row) => sum + (row.estimated_cost ?? 0), 0),
    unpriced: usage.filter((row) => row.estimated_cost === null).length,
  };
}
