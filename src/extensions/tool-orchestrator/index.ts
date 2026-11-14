/**
 * Tool Orchestrator — Agentic Tool Loop (AI SDK v7)
 *
 * Single `streamText` call where the LLM autonomously decides which tools to call,
 * the SDK handles execution and re-invocation, and the stream delivers text + tool
 * activity to the UI.
 *
 * Replaces the previous 3-step intent-routed architecture:
 *   Step 1 (classify intent) → deleted, LLM expresses intent via tool selection
 *   Step 2 (programmatic retrieval) → deleted, tool execute functions handle data fetching
 *   Step 3 (synthesis) → merged into the single streamText call
 *
 * Single call site: ChatContext.sendMessage().
 */

import { streamText, isStepCount } from 'ai';
import { createModel, toSDKMessages, getWebSearchTools, toExecutableTools } from '@services/ai';
import { resolveModel } from '@shared/utils/modelResolver';
import { toolRegistry, loadMcpTools } from '@extensions/tools';
import { DEFAULT_CHAT_TOOLS } from '@config/chatTools.config';
import { extractTokenUsage } from '@services/ai/types';
import type { TokenUsage } from '@services/ai/types';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';

/** Safety cap for the agentic loop. Most queries resolve in 1–3 tool calls. */
const MAX_AGENT_STEPS = 10;

/**
 * Run the agentic tool loop.
 *
 * The LLM sees all meeting tools + connected MCP tools + web search tools and
 * autonomously decides:
 * - Whether to call tools or respond directly
 * - Which tools to call and in what order
 * - When to stop calling tools and generate a response
 */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks,
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage }> {
  const {
    messages, systemPrompt, settings, providers, historyItems,
    signal, webSearchEnabled, skipRetrieval,
  } = options;
  const { onChunk, onToolActivity } = callbacks;

  // ── Resolve model ──

  const resolved = resolveModel(settings.chatModel, providers);
  if (!resolved) {
    throw new Error(`Model "${settings.chatModel}" not found. Please configure a model in Settings → Providers.`);
  }
  if (!resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }

  // ── Build tools ──

  const webSearchTools = webSearchEnabled ? getWebSearchTools(resolved) : undefined;
  const hasTools = !skipRetrieval;

  let tools = webSearchTools;

  // Built-in tools + connected MCP tools the user left on (composer Tools
  // picker), through one bridge. All switched off → no tools at all (an
  // empty tool set is rejected by some providers).
  const prefs = settings.chatTools ?? DEFAULT_CHAT_TOOLS;
  const definitions = hasTools
    ? [
        ...(prefs.meetingTools ? toolRegistry.getTools() : []),
        ...(await loadMcpTools(new Set(toolRegistry.getToolNames()), new Set(prefs.disabledMcpTools))),
      ]
    : [];

  if (definitions.length > 0) {
    const meetingTools = toExecutableTools(
      definitions,
      { historyItems, signal },
      {
        onToolActivity,
        onCitations: () => {
          // Citations flow through onToolActivity → result.meta.citations.
          // ChatContext already extracts and deduplicates them there.
        },
      },
    );
    tools = { ...meetingTools, ...webSearchTools };
  }

  // ── Build model & messages ──

  const model = createModel(resolved, { webSearch: !!webSearchTools });
  const sdkMessages = toSDKMessages(messages);

  // ── Stream ──

  const result = streamText({
    model,
    instructions: systemPrompt,
    messages: sdkMessages,
    abortSignal: signal,
    ...(tools && {
      tools,
      toolChoice: 'auto' as const,
      stopWhen: isStepCount(MAX_AGENT_STEPS),
    }),
  });

  const collectedSources: Array<{ url: string; title: string }> = [];
  let hasText = false;

  for await (const part of result.stream) {
    if (signal?.aborted) break;

    switch (part.type) {
      case 'text-delta': {
        hasText = true;
        // Strip citation cruft from web search responses — sources are
        // collected separately via source events and shown in Sources panel.
        // <cite> tags: OpenAI; [N] brackets: xAI/Grok.
        const text = part.text
          .replace(/<\/?cite[^>]*>/g, '')
          .replace(/\[(\d+)\](?!\()/g, '');
        if (text) onChunk(text);
        break;
      }

      case 'reasoning-delta':
        onChunk('', { isThinking: true, thinkingContent: part.text });
        break;

      // Native provider tools (web search) — signal inline status.
      // Meeting tool activity is tracked by the execute wrapper in tools-bridge.
      case 'tool-input-start':
        onChunk('', { isSearching: true });
        break;

      case 'source':
        if (part.sourceType === 'url') {
          collectedSources.push({ url: part.url, title: part.title || '' });
        }
        break;

      case 'error':
        console.error('[Orchestrator] Stream error:', part.error);
        throw part.error instanceof Error
          ? part.error
          : new Error(String(part.error ?? 'Model returned a stream error'));
    }
  }

  // Detect empty response
  if (!hasText && !signal?.aborted) {
    const finishReason = await result.finishReason;
    console.warn('[Orchestrator] Produced no text. finishReason:', finishReason);
    throw new Error(
      finishReason === 'content-filter'
        ? 'Response blocked by content filter.'
        : `Model produced no text response (finish reason: ${finishReason ?? 'unknown'}). This may indicate a tool loop exhaustion or an unsupported model.`,
    );
  }

  // Flush web citations
  if (collectedSources.length > 0) {
    onChunk('', { webCitations: collectedSources });
  }

  const usage = await result.usage;

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage: extractTokenUsage(usage),
  };
}
