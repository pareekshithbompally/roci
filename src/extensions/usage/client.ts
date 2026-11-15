/** Usage logging and queries via Tauri; logging is fire-and-forget. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import type { TokenUsage } from '@services/ai/types';
import { estimateCost } from './pricing';
import type { UsageRecord, UsageCategory, UsageSummary } from './types';

/** Ensure the store plugin is initialized before any usage operation. */
let initPromise: Promise<void> | null = null;
function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = invoke('plugin:store|initialize').then(
      () => {},
      (err) => { initPromise = null; throw err; },
    );
  }
  return initPromise;
}

/** Logs a usage record, mapping TokenUsage to the flat UsageRecord Rust expects. */
export async function logUsage(params: {
  category: UsageCategory;
  sessionId?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  estimatedCost?: number;
}): Promise<void> {
  if (!isTauriEnvironment()) return;
  if (!params.provider || !params.model) return;

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
    estimated_cost: params.estimatedCost ?? estimateCost(params.provider, params.model, params.usage),
  };

  try {
    await ensureInitialized();
    await invoke('plugin:store|insert_usage', { record });
  } catch (error) {
    console.error('[UsageClient] insert_usage failed:', error, '| record:', JSON.stringify({ category: record.category, provider: record.provider, model: record.model }));
  }
}

/** Which model a call ran on: a resolved chat/summary model or a speech selection. */
export interface UsageSource {
  provider: string;
  modelId: string;
}

/** Records one AI call's tokens; a logging failure never reaches the caller. */
export function recordUsage(category: UsageCategory, source: UsageSource, usage: TokenUsage, sessionId?: string): void {
  logUsage({ category, sessionId, provider: source.provider, model: source.modelId, usage })
    .catch((error: unknown) => console.error(`[Usage] ${category}:`, error));
}

/** Aggregated usage since `since` (epoch ms), or for all time when undefined. */
export async function getUsageSummary(since?: number): Promise<UsageSummary> {
  if (!isTauriEnvironment()) {
    return {
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_calls: 0,
      by_provider_model: [],
      by_category: [],
    };
  }

  await ensureInitialized();
  return invoke<UsageSummary>('plugin:store|get_usage_summary', {
    since: since ?? null,
  });
}
