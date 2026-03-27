/**
 * Tool Orchestrator — 3-Step Intent-Routed Architecture
 *
 * Step 1 — classifyIntent(): LLM classifies user intent, extracts retrieval params.
 * Step 2 — executeRetrieval(): Programmatic data fetching (no LLM, direct DB access).
 * Step 3 — synthesisPhase(): Streaming synthesis with retrieved context + web search.
 *
 * The synthesis LLM does NOT call meeting tools — all data is fetched in Step 2.
 * Only web search tools remain available in synthesis (if enabled).
 *
 * Single call site from ChatContext — orchestrate() signature unchanged.
 */

import { streamText, stepCountIs } from 'ai';
import { createModel, toSDKMessages, getWebSearchTools } from '@/services/ai';
import { resolveModel } from '@shared/utils/modelResolver';
import type { OrchestratorOptions, OrchestratorCallbacks, IntentClassification, RetrievalResult } from './types';
import { classifyIntent } from './intent-classifier';
import { executeRetrieval } from './retrieval-executor';
import { extractTokenUsage, mergeTokenUsage } from '@/services/ai/types';
import type { TokenUsage } from '@/services/ai/types';

// Native provider tools (web search) need multi-step: model calls tool → provider
// executes server-side → SDK feeds results back → model generates text.
// 3 steps is enough: call + result + synthesis. Without this, streamText does one
// step and the chain dies silently after the tool call.
const SYNTHESIS_TOOL_STEPS = 3;

// ── Synthesis (Step 3) ─────────────────────────────────────────────────────

async function synthesisPhase(params: {
  resolved: Parameters<typeof createModel>[0];
  messages: OrchestratorOptions['messages'];
  systemPrompt: string;
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
  retrievalContext: string;
  intentType?: string;
  onChunk: OrchestratorCallbacks['onChunk'];
  onMediaPart?: OrchestratorCallbacks['onMediaPart'];
}): Promise<TokenUsage | undefined> {
  const useWebSearch = !!params.webSearchEnabled;
  const webSearchTools = useWebSearch ? getWebSearchTools(params.resolved) : undefined;
  const model = createModel(params.resolved, { webSearch: !!webSearchTools });

  // Build messages: conversation history + injected retrieval context.
  // Context goes into messages (not system prompt) so it works reliably
  // across all providers — Gemini in particular chokes on oversized system instructions.
  const sdkMessages = toSDKMessages(params.messages);
  if (params.retrievalContext) {
    sdkMessages.push(
      { role: 'assistant', content: params.retrievalContext },
    );

    if (params.intentType === 'manage_todos') {
      // The user sees a confirmation card in the UI — the LLM must acknowledge briefly
      sdkMessages.push({
        role: 'user',
        content:
          'A todo confirmation card is now visible in the UI for the user to review and confirm. ' +
          'There may be one or multiple todos listed. ' +
          'Briefly acknowledge what you understood from their request in 1-2 short sentences. ' +
          'Do NOT say you created or saved anything — the user still needs to confirm via the card. ' +
          'Do NOT repeat every field. Be natural and concise.',
      });
    } else {
      sdkMessages.push({
        role: 'user',
        content: 'Based on the retrieved context above, provide a comprehensive answer to my question.',
      });
    }
  }

  const result = streamText({
    model,
    system: params.systemPrompt,
    messages: sdkMessages,
    abortSignal: params.signal,
    ...(webSearchTools && {
      tools: webSearchTools,
      // Native provider tools (web search) are server-executed but the SDK still
      // needs multiple steps: model calls tool → provider runs it → model gets
      // results → model generates text. Without this the chain dies after step 1.
      stopWhen: stepCountIs(SYNTHESIS_TOOL_STEPS),
    }),
  });

  const collectedSources: Array<{ url: string; title: string }> = [];
  let hasText = false;

  for await (const part of result.fullStream) {
    if (params.signal?.aborted) break;

    switch (part.type) {
      case 'text-delta': {
        hasText = true;
        // Strip citation cruft from web search responses — sources are
        // collected separately via source events and shown in Sources panel.
        // <cite> tags: OpenAI; [N] brackets: xAI/Grok.
        const text = part.text
          .replace(/<\/?cite[^>]*>/g, '')
          .replace(/\[(\d+)\](?!\()/g, '');
        if (text) params.onChunk(text);
        break;
      }
      case 'reasoning-delta':
        params.onChunk('', { isThinking: true, thinkingContent: part.text });
        break;

      // Native provider tools (web search) — signal inline status via onChunk
      // metadata. No tool_call UI blocks — only custom meeting tools get those.
      case 'tool-input-start':
        params.onChunk('', { isSearching: true });
        break;

      case 'source':
        if (part.sourceType === 'url') {
          collectedSources.push({ url: part.url, title: part.title || '' });
        }
        break;
      case 'error':
        console.error('[Orchestrator] Synthesis stream error:', part.error);
        throw part.error instanceof Error
          ? part.error
          : new Error(String(part.error ?? 'Model returned a stream error'));
    }
  }

  // Detect empty response — synthesis must always produce text.
  if (!hasText && !params.signal?.aborted) {
    const finishReason = await result.finishReason;
    console.warn('[Orchestrator] Synthesis produced no text. finishReason:', finishReason);
    throw new Error(
      finishReason === 'content-filter'
        ? 'Response blocked by content filter.'
        : `Model produced no text response (finish reason: ${finishReason ?? 'unknown'}). This may indicate a web search failure or an unsupported model.`
    );
  }

  if (collectedSources.length > 0) {
    params.onChunk('', { webCitations: collectedSources });
  }

  const usage = await result.usage;
  return extractTokenUsage(usage);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the 3-step intent-routed orchestration.
 * Step 1: Classify user intent (LLM).
 * Step 2: Programmatic retrieval based on intent (no LLM).
 * Step 3: Synthesize answer with retrieved context (streaming LLM).
 */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage }> {
  const { messages, systemPrompt, settings, providers, historyItems, signal,
          webSearchEnabled } = options;
  const { onChunk, onMediaPart, onToolActivity } = callbacks;

  const resolved = resolveModel(settings.chatModel, providers);
  if (!resolved) {
    throw new Error(`Model "${settings.chatModel}" not found. Please configure a model in Settings → Providers.`);
  }
  if (!resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }

  // ── Step 1: Intent Classification ──
  const skipClassification = options.skipRetrieval ?? false;
  let intent: IntentClassification;
  let classifierUsage: TokenUsage | undefined;

  if (skipClassification) {
    // Model doesn't support tools → treat as general
    intent = { intent: 'general', confidence: 'high', depth: 'none' };
  } else {
    try {
      const classifierModel = createModel(resolved);
      intent = await classifyIntent({
        model: classifierModel,
        messages,
        meetingCount: historyItems.length,
        signal,
      });
    } catch (error) {
      console.error('[Orchestrator] Step 1 classification failed, treating as general:', error);
      intent = { intent: 'general', confidence: 'high', depth: 'none' };
    }
  }

  // ── Step 2: Programmatic Retrieval ──
  let retrievalResult: RetrievalResult = { context: '', citations: [], toolsUsed: [] };
  // manage_todos always needs retrieval (to run the tool) even at depth none
  const needsRetrieval = intent.depth !== 'none' || intent.intent === 'manage_todos';
  if (needsRetrieval) {
    try {
      retrievalResult = await executeRetrieval({
        intent,
        historyItems,
        signal,
        onToolActivity,
      });
    } catch (error) {
      console.error('[Orchestrator] Step 2 retrieval failed, continuing:', error);
    }
  }

  // ── Step 3: Synthesis (streaming) ──
  const synthesisUsage = await synthesisPhase({
    resolved, messages, systemPrompt,
    webSearchEnabled, signal,
    retrievalContext: retrievalResult.context,
    intentType: intent.intent,
    onChunk, onMediaPart,
  });

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage: mergeTokenUsage(classifierUsage, synthesisUsage),
  };
}
