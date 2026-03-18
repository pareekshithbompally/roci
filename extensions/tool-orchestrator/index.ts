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
  onToolActivity: OrchestratorCallbacks['onToolActivity'];
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

  // Native tools (web search) are server-executed — sources arrive AFTER the
  // tool-call part. We defer marking them "done" until the stream ends so the
  // result block shows actual source count instead of "Done".
  const pendingNativeTools = new Map<string, { toolName: string; call: ToolCall }>();

  let hasText = false;

  for await (const part of result.fullStream) {
    if (params.signal?.aborted) break;

    switch (part.type) {
      case 'text-delta':
        hasText = true;
        params.onChunk(part.text);
        break;
      case 'reasoning-delta':
        params.onChunk('', { isThinking: true, thinkingContent: part.text });
        break;

      // ── Native tool UI feedback ──────────────────────────────────────
      // Provider-defined tools (web search) are executed server-side by the
      // provider API. The SDK streams tool-input-start when the model begins
      // a tool call, then tool-call when it's finalized. We emit 'calling'
      // immediately for the spinner, but defer 'done' until after sources
      // are counted so the result shows meaningful data.
      case 'tool-input-start': {
        const call: ToolCall = {
          id: part.id,
          name: part.toolName,
          arguments: {},
        };
        pendingNativeTools.set(part.id, { toolName: part.toolName, call });
        params.onToolActivity({
          toolName: part.toolName,
          label: toolLabel(part.toolName, 'calling'),
          status: 'calling',
          toolCall: call,
        });
        break;
      }
      case 'tool-call': {
        // Update stored call with final args — don't emit 'done' yet
        const pending = pendingNativeTools.get(part.toolCallId);
        if (pending) {
          pending.call.arguments = (part.input != null ? part.input : {}) as Record<string, unknown>;
        }
        break;
      }

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

  // ── Finalize native tool blocks with actual results ─────────────────
  // Now that sources are fully collected, mark each native tool as done
  // with a meaningful result instead of "Done".
  for (const [, { toolName, call }] of pendingNativeTools) {
    const sourceCount = collectedSources.length;
    const content = sourceCount > 0
      ? `Found ${sourceCount} source${sourceCount !== 1 ? 's' : ''}`
      : 'Search complete — no sources returned';

    params.onToolActivity({
      toolName,
      label: toolLabel(toolName, 'complete'),
      status: 'done',
      toolCall: call,
      result: {
        toolCallId: call.id,
        content,
        isError: false,
        meta: { toolName, executionMs: 0 },
      },
    });
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
  const retrievalContext = await retrievalPhase({
    resolved, messages, historyItems, signal,
    schemas,
    toolChoice: effectiveToolChoice,
    onToolActivity,
  });

  // ── Phase 2: Synthesis ────────────────────────────────────────────────────
  const tokenUsage = await synthesisPhase({
    resolved, messages, systemPrompt, outputSchema,
    webSearchEnabled, signal, retrievalContext,
    onChunk, onMediaPart, onToolActivity,
  });

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage,
  };
}
