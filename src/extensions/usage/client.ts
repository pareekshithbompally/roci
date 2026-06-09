/**
 * Usage Tracking Client
 *
 * Thin wrapper around Tauri invoke calls for usage logging and querying.
 * All logging is fire-and-forget — never blocks the primary flow.
 */

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

/**
 * Log a usage record from token data. Handles the mapping from
 * our TokenUsage interface to the flat UsageRecord the Rust side expects.
 */
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

/**
 * Query aggregated usage summary for a time range.
 * @param since — epoch ms timestamp, or undefined for all time
 */
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
