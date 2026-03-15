/**
 * Tool Orchestrator
 *
 * The core tool-calling loop. Provider-agnostic.
 *
 * 1. Create MessageBuffer from input messages
 * 2. Loop up to MAX_ITERATIONS:
 *    a. Check abort signal
 *    b. Call adapter.chatStreamWithTools() with buffer contents
 *    c. If no tool calls returned → done (text response streamed to UI)
 *    d. If tool calls → add to buffer, execute each, emit onToolActivity, add results to buffer
 *    e. Continue loop (LLM gets tool results in next iteration)
 * 3. On error: preserve partial text, propagate error
 * 4. Returns void (all output streamed via callbacks)
 */

import { resolveModel, getProviderType } from '@shared/utils/modelResolver';
import { getAdapter } from '@/services/adapters';
import { toolRegistry, toolExecutor } from '@extensions/tools';
import { toolLabel } from '@shared/utils/toolUtils';
import type { ToolCall, ToolResult } from '@extensions/tools/types';
import type { ToolStreamOptions, ToolStreamCallbacks, ToolCallEvent, TokenUsage } from '@/services/adapters/types';
import { MessageBuffer } from './message-buffer';
import type { OrchestratorOptions, OrchestratorCallbacks, ToolActivity } from './types';

const MAX_ITERATIONS = 6;

/**
 * Run the tool orchestration loop.
 * Streams text to UI via callbacks, executes tools when requested by the LLM.
 *
 * Adapters that manage the full agentic loop internally (e.g. Gemini) receive
 * executeTools and call it directly, returning only when fully done.
 * Adapters that do single-turn tool calling (OpenAI, Anthropic) fire onToolCall
 * and the outer loop here drives the next iteration.
 */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage }> {
  const { messages, systemPrompt, settings, providers, historyItems, signal, webSearchEnabled, outputSchema, toolChoice } = options;
  const { onChunk, onMediaPart, onToolActivity } = callbacks;

  const resolved = resolveModel(settings.chatModel, providers);
  if (!resolved) {
    throw new Error(`Model "${settings.chatModel}" not found. Please configure a model in Settings → Providers.`);
  }
  if (!resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }

  const adapter = getAdapter(getProviderType(resolved.provider));

  if (!adapter.chatStreamWithTools) {
    throw new Error(`Adapter for ${resolved.provider} does not support tool calling.`);
  }

  const schemas = toolRegistry.getSchemas();
  const buffer = new MessageBuffer(messages);

  // Single shared executor — used by both the Gemini internal loop (via executeTools callback)
  // and the outer iteration loop for other adapters. Defined once, no duplication.
  const executeTools = async (calls: ToolCall[]): Promise<ToolResult[]> => {
    const results: ToolResult[] = [];
    for (const call of calls) {
      if (signal?.aborted) break;

      const activity: ToolActivity = {
        toolName: call.name,
        label: toolLabel(call.name, 'calling'),
        status: 'calling',
        toolCall: call,
      };
      onToolActivity(activity);

      const result = await toolExecutor.execute(call, { historyItems, signal });
      results.push(result);

      onToolActivity({ ...activity, status: 'done', result });
    }
    return results;
  };

  let accumulatedOutputTokens = 0;
  let lastInputTokens: number | undefined;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) break;

    // pendingToolCalls is set only when the adapter fires onToolCall (non-Gemini path).
    // Adapters that self-manage (Gemini) never fire onToolCall, so this stays null
    // and the loop exits naturally after the first iteration.
    let pendingToolCalls: ToolCall[] | null = null;
    let textBefore: string | undefined;

    // When toolChoice is 'none', omit tools entirely — the LLM shouldn't see them
    const effectiveTools = toolChoice === 'none' ? undefined : schemas;

    const streamOptions: ToolStreamOptions = {
      messages: buffer.getMessages(),
      resolved,
      systemPrompt: systemPrompt,
      webSearchEnabled,
      signal,
      tools: effectiveTools,
      toolMessages: buffer.getToolMessages(),
      outputSchema: outputSchema,
      toolChoice,
    };

    const streamCallbacks: ToolStreamCallbacks = {
      onChunk,
      onMediaPart,
      onToolCall: (event: ToolCallEvent) => {
        pendingToolCalls = event.toolCalls;
        textBefore = event.textBefore;
      },
      executeTools,
    };

    const iterationUsage = await adapter.chatStreamWithTools(streamOptions, streamCallbacks);
    if (iterationUsage) {
      accumulatedOutputTokens += iterationUsage.outputTokens || 0;
      lastInputTokens = iterationUsage.inputTokens;
    }

    if (!pendingToolCalls || pendingToolCalls.length === 0 || toolChoice === 'none') break;

    // Non-Gemini path: adapter fired onToolCall, execute tools and loop
    buffer.addAssistantToolCalls(pendingToolCalls, textBefore);
    const results = await executeTools(pendingToolCalls);
    buffer.addToolResults(results);
  }

  const tokenUsage: TokenUsage | undefined =
    accumulatedOutputTokens > 0 || lastInputTokens != null
      ? { inputTokens: lastInputTokens, outputTokens: accumulatedOutputTokens || undefined }
      : undefined;

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage,
  };
}