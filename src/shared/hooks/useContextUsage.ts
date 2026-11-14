/**
 * Context Usage Derivation
 *
 * Measures how much of the active model's context window the current
 * conversation occupies. Mirrors llama.cpp's web UI approach: the total is
 * server-declared (see `getModelContextLimit`), and usage is measured from
 * provider-reported token counts — the last assistant message's input tokens
 * equal the full prompt the model saw (history + tool results), which is the
 * same property llama.cpp reads from `prompt_n`.
 *
 * Returns null when there is nothing to show (unknown total, or no usage
 * recorded yet) so callers can hide the gauge entirely.
 */

import { useMemo } from 'react';
import type { ChatMessage } from '@shared/types';

/** Percent thresholds where the ring changes color. */
export const CONTEXT_WARNING_PERCENT = 80;
export const CONTEXT_CRITICAL_PERCENT = 95;

export type ContextLevel = 'ok' | 'warning' | 'critical';

export interface ContextUsage {
  /** Context window size in tokens (server-declared). */
  total: number;
  /** Current occupancy: last turn's input + output tokens. */
  used: number;
  /** Rounded 0–100 percent of the window occupied. */
  percent: number;
  level: ContextLevel;
  /** Last turn's input (prompt) tokens. */
  currentInput: number;
  /** Last turn's output tokens. */
  currentOutput: number;
  /** Last turn's input tokens served from cache (subset of currentInput). */
  currentCache: number;
  /** Sum of input tokens across assistant turns. */
  cumulativeInput: number;
  /** Sum of output tokens across assistant turns. */
  cumulativeOutput: number;
  /** Last measured tokens/second, when available. */
  speed: number | null;
}

export function contextLevelFor(percent: number): ContextLevel {
  if (percent >= CONTEXT_CRITICAL_PERCENT) return 'critical';
  if (percent >= CONTEXT_WARNING_PERCENT) return 'warning';
  return 'ok';
}

function hasUsage(m: ChatMessage): boolean {
  return m.inputTokenCount != null || m.tokenCount != null;
}

/**
 * Derive context usage from persisted session messages.
 *
 * @param messages - Active session messages in order.
 * @param contextTotal - Model context window in tokens, or null when unknown.
 */
export function deriveContextUsage(
  messages: ChatMessage[],
  contextTotal: number | null
): ContextUsage | null {
  if (contextTotal == null || contextTotal <= 0) return null;

  const assistant = messages.filter((m) => m.role === 'model' && hasUsage(m));
  if (assistant.length === 0) return null;

  const last = assistant[assistant.length - 1];
  const currentInput = last.inputTokenCount ?? 0;
  const currentOutput = last.tokenCount ?? 0;
  const currentCache = Math.min(last.cacheReadTokens ?? 0, currentInput);

  let cumulativeInput = 0;
  let cumulativeOutput = 0;
  for (const m of assistant) {
    cumulativeInput += m.inputTokenCount ?? 0;
    cumulativeOutput += m.tokenCount ?? 0;
  }

  const used = currentInput + currentOutput;
  const percent = Math.round((used / contextTotal) * 100);

  return {
    total: contextTotal,
    used,
    percent,
    level: contextLevelFor(percent),
    currentInput,
    currentOutput,
    currentCache,
    cumulativeInput,
    cumulativeOutput,
    speed: last.tokensPerSecond ?? null,
  };
}

/** Memoized `deriveContextUsage` for render. */
export function useContextUsage(
  messages: ChatMessage[],
  contextTotal: number | null
): ContextUsage | null {
  return useMemo(() => deriveContextUsage(messages, contextTotal), [messages, contextTotal]);
}
