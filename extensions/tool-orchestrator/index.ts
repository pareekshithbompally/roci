/**
 * Tool Orchestrator
 *
 * Two-phase design:
 *  Phase 1 — retrievalPhase(): lean retrieval prompt, custom tools, text suppressed from UI.
 *  Phase 2 — synthesisPhase(): full system prompt + retrieved context, native provider tools
 *            (web search), streams to user with UI feedback for native tool activity.
 *
 * Uses the AI SDK's generateText with stopWhen:stepCountIs() for Phase 1 — the SDK handles
 * the tool-call loop internally. Phase 2 uses streamText with stopWhen for native tools.
 *
 * Single call site from ChatContext — orchestrate() signature unchanged.
 */

import { generateText, streamText, tool, jsonSchema, stepCountIs, Output } from 'ai';
import type { ToolSet } from 'ai';
import { createModel, toSDKMessages, getWebSearchTools } from '@/services/ai';
import { resolveModel } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { toolRegistry, toolExecutor } from '@extensions/tools';
import { toolLabel } from '@shared/utils/toolUtils';
import type { ToolCall, ToolResult, ToolSchema } from '@extensions/tools/types';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';
import { needsRetrieval } from './intent';
import { buildRetrievalSystemPrompt } from '@core/ai/prompts/chat.prompt';
import type { TokenUsage } from '@/services/ai/types';

// Safety cap — the LLM should stop naturally (no tool calls = done).
// This exists only to prevent infinite loops from bugs or confused models.
const RETRIEVAL_SAFETY_CAP = 10;

// Native provider tools (web search) need multi-step: model calls tool → provider
// executes server-side → SDK feeds results back → model generates text.
// 3 steps is enough: call + result + synthesis. Without this, streamText does one
// step and the chain dies silently after the tool call.
const SYNTHESIS_TOOL_STEPS = 3;

// ── Helpers ────────────────────────────────────────────────────────────────

function assembleRetrievalContext(results: ToolResult[]): string {
  if (results.length === 0) return '';

  const lines: string[] = ['## Retrieved Context'];
  lines.push('');

  for (const result of results) {
    const toolName = result.meta?.toolName ?? 'tool';
    lines.push(`### ${toolName}`);
    lines.push(result.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build AI SDK tools with execute functions bridged to our ToolExecutor.
 * Emits 'calling' before execution and 'done' after, for tool activity UI.
 * Accumulates ToolResults into allResults for retrieval context assembly.
 */
function buildExecutableTools(
  schemas: ToolSchema[],
  historyItems: OrchestratorOptions['historyItems'],
  signal: AbortSignal | undefined,
  onToolActivity: OrchestratorCallbacks['onToolActivity'],
  allResults: ToolResult[],
): ToolSet {
  const tools: ToolSet = {};

  for (const schema of schemas) {
    tools[schema.name] = tool({
      description: schema.description,
      inputSchema: jsonSchema(schema.parameters as Parameters<typeof jsonSchema>[0]),
      execute: async (args) => {
        const call: ToolCall = {
          id: crypto.randomUUID(),
          name: schema.name,
          arguments: args as Record<string, unknown>,
        };

        onToolActivity({
          toolName: schema.name,
          label: toolLabel(schema.name, 'calling'),
          status: 'calling',
          toolCall: call,
        });

        const result = await toolExecutor.execute(call, { historyItems, signal });
        allResults.push(result);

        onToolActivity({
          toolName: schema.name,
          label: toolLabel(schema.name, 'complete'),
          status: 'done',
          toolCall: call,
          result,
        });

        return result.content;
      },
    });
  }

  return tools;
}

// ── Phase 1 ────────────────────────────────────────────────────────────────

function getLastUserMessage(messages: OrchestratorOptions['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].text;
  }
  return '';
}

async function retrievalPhase(params: {
  resolved: ResolvedModel;
  messages: OrchestratorOptions['messages'];
  historyItems: OrchestratorOptions['historyItems'];
  signal?: AbortSignal;
  schemas: ToolSchema[];
  toolChoice: OrchestratorOptions['toolChoice'];
  onToolActivity: OrchestratorCallbacks['onToolActivity'];
}): Promise<string> {
  const allResults: ToolResult[] = [];
  const model = createModel(params.resolved);
  const tools = buildExecutableTools(
    params.schemas,
    params.historyItems,
    params.signal,
    params.onToolActivity,
    allResults,
  );

  await generateText({
    model,
    system: buildRetrievalSystemPrompt(),
    messages: toSDKMessages(params.messages),
    tools,
    toolChoice: params.toolChoice ?? 'auto',
    stopWhen: stepCountIs(RETRIEVAL_SAFETY_CAP),
    abortSignal: params.signal,
  });

  return assembleRetrievalContext(allResults);
}

// ── Phase 2 ────────────────────────────────────────────────────────────────

async function synthesisPhase(params: {
  resolved: ResolvedModel;
  messages: OrchestratorOptions['messages'];
  systemPrompt: string;
  outputSchema?: OrchestratorOptions['outputSchema'];
  webSearchEnabled?: boolean;
  signal?: AbortSignal;
  retrievalContext: string;
  onChunk: OrchestratorCallbacks['onChunk'];
  onMediaPart?: OrchestratorCallbacks['onMediaPart'];
}): Promise<TokenUsage | undefined> {
  const model = createModel(params.resolved);
  const webSearchTools = params.webSearchEnabled ? getWebSearchTools(params.resolved) : undefined;

  // Build messages: conversation history + injected retrieval context.
  // Context goes into messages (not system prompt) so it works reliably
  // across all providers — Gemini in particular chokes on oversized system instructions.
  const sdkMessages = toSDKMessages(params.messages);
  if (params.retrievalContext) {
    sdkMessages.push(
      { role: 'assistant', content: params.retrievalContext },
      { role: 'user', content: 'Based on the retrieved context above, provide a comprehensive answer to my question.' },
    );
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
    ...(params.outputSchema && { output: Output.object({ schema: jsonSchema(params.outputSchema.schema) }) }),
  });

  const collectedSources: Array<{ url: string; title: string }> = [];
  let hasText = false;

  for await (const part of result.fullStream) {
    if (params.signal?.aborted) break;

    switch (part.type) {
      case 'text-delta': {
        hasText = true;
        // Strip <cite> tags from web search responses — citations are
        // collected separately via source events and shown in Sources tab.
        const text = part.text.replace(/<\/?cite[^>]*>/g, '');
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
  return {
    inputTokens: usage.inputTokens ?? undefined,
    outputTokens: usage.outputTokens ?? undefined,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the two-phase orchestration loop.
 * Phase 1: retrieve context via tools (tool blocks visible, text suppressed).
 * Phase 2: synthesize answer with retrieved context (streamed to user).
 */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage }> {
  const { messages, systemPrompt, settings, providers, historyItems, signal,
          webSearchEnabled, outputSchema, toolChoice } = options;
  const { onChunk, onMediaPart, onToolActivity } = callbacks;

  const resolved = resolveModel(settings.chatModel, providers);
  if (!resolved) {
    throw new Error(`Model "${settings.chatModel}" not found. Please configure a model in Settings → Providers.`);
  }
  if (!resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }

  const schemas = toolRegistry.getSchemas();
  const effectiveToolChoice = toolChoice ?? 'auto';

  // ── Phase 1: Retrieval ────────────────────────────────────────────────────
  const skipRetrieval = options.skipRetrieval ?? false;
  const shouldRetrieve = !skipRetrieval && needsRetrieval(
    getLastUserMessage(messages),
    historyItems.length,
  );
  const retrievalContext = shouldRetrieve
    ? await retrievalPhase({
        resolved, messages, historyItems, signal,
        schemas,
        toolChoice: effectiveToolChoice,
        onToolActivity,
      })
    : '';

  // ── Phase 2: Synthesis ────────────────────────────────────────────────────
  const tokenUsage = await synthesisPhase({
    resolved, messages, systemPrompt, outputSchema,
    webSearchEnabled, signal, retrievalContext,
    onChunk, onMediaPart,
  });

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage,
  };
}
