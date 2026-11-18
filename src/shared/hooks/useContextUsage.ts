/** Context-window use after the chat's last reply: its last model call's prompt plus reply, against the model's window; null hides it. */

import { useMemo } from 'react';
import type { ChatMessage, ContextTokens } from '@shared/types';

/** Percent thresholds where the ring changes color. */
export const CONTEXT_WARNING_PERCENT = 80;
export const CONTEXT_CRITICAL_PERCENT = 95;

export type ContextLevel = 'ok' | 'warning' | 'critical';

export interface ContextUsage extends ContextTokens {
  /** The model's context window, in tokens. */
  total: number;
  /** Tokens the window holds: the last call's prompt plus its reply. */
  used: number;
  /** Tokens still free. */
  left: number;
  /** 0–100 of the window used. */
  percent: number;
  level: ContextLevel;
}

export function contextLevelFor(percent: number): ContextLevel {
  if (percent >= CONTEXT_CRITICAL_PERCENT) return 'critical';
  if (percent >= CONTEXT_WARNING_PERCENT) return 'warning';
  return 'ok';
}

/** The chat's context use after its last measured reply; null when the window or the use is unknown. */
export function deriveContextUsage(messages: ChatMessage[], contextTotal: number | null): ContextUsage | null {
  if (contextTotal == null || contextTotal <= 0) return null;
  const context = messages.filter((m) => m.role === 'model' && m.context).at(-1)?.context;
  if (!context) return null;
  const used = context.prompt + context.reply;
  const percent = Math.min(100, Math.round((used / contextTotal) * 100));
  return {
    total: contextTotal,
    used,
    left: Math.max(0, contextTotal - used),
    percent,
    level: contextLevelFor(percent),
    prompt: context.prompt,
    cached: Math.min(context.cached, context.prompt),
    reply: context.reply,
  };
}

/** Memoized `deriveContextUsage` for render. */
export function useContextUsage(messages: ChatMessage[], contextTotal: number | null): ContextUsage | null {
  return useMemo(() => deriveContextUsage(messages, contextTotal), [messages, contextTotal]);
}
