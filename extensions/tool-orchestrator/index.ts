/**
 * Tool Orchestrator
 *
 * Two-phase design:
 *  Phase 1 — retrievalPhase(): lean retrieval prompt, tools available (parallel), text suppressed from UI.
 *  Phase 2 — synthesisPhase(): full system prompt + retrieved context, no tools, streams to user.
 *
 * All adapters are single-pass. The orchestrator owns the loop for all providers.
 * The LLM decides when it has enough context (no tool calls = done).
 * A safety cap prevents infinite loops from bugs but should never be hit.
 *
 * Single call site from ChatContext — orchestrate() signature unchanged.
 */

import { resolveModel, getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { getAdapter } from '@/services/adapters';
import type { ILLMAdapter, ToolStreamOptions, ToolStreamCallbacks, ToolCallEvent, TokenUsage, ToolChoice } from '@/services/adapters/types';
import { toolRegistry, toolExecutor } from '@extensions/tools';
import { toolLabel } from '@shared/utils/toolUtils';
import type { ToolCall, ToolResult, ToolSchema } from '@extensions/tools/types';
import { MessageBuffer } from './message-buffer';
import type { OrchestratorOptions, OrchestratorCallbacks, ToolActivity } from './types';
import { buildRetrievalSystemPrompt } from '@core/ai/prompts/chat.prompt';

// Safety cap — the LLM should stop naturally (no tool calls = done).
// This exists only to prevent infinite loops from bugs or confused models.
const RETRIEVAL_SAFETY_CAP = 10;

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

// ── Phase 1 ────────────────────────────────────────────────────────────────

async function retrievalPhase(params: {
  adapter: ILLMAdapter;
  resolved: ResolvedModel;
  messages: OrchestratorOptions['messages'];
  historyItems: OrchestratorOptions['historyItems'];
  signal?: AbortSignal;
  webSearchEnabled?: boolean;
  schemas: ToolSchema[];
  toolChoice: ToolChoice;
  onToolActivity: OrchestratorCallbacks['onToolActivity'];
}): Promise<string> {
  const { adapter, resolved, messages, historyItems, signal,
          webSearchEnabled, schemas, toolChoice, onToolActivity } = params;

  const buffer = new MessageBuffer(messages);
  const allToolResults: ToolResult[] = [];
  let adapterState: unknown;

  const retrievalSystemPrompt = buildRetrievalSystemPrompt();

  for (let round = 0; round < RETRIEVAL_SAFETY_CAP; round++) {
    if (signal?.aborted) break;

    let pendingToolCalls: ToolCall[] | null = null;
    let textBefore: string | undefined;

    const streamOptions: ToolStreamOptions = {
      messages: buffer.getMessages(),
      resolved,
      systemPrompt: retrievalSystemPrompt,
      webSearchEnabled,
      signal,
      tools: schemas,
      toolMessages: buffer.getToolMessages(),
      outputSchema: undefined,
      toolChoice,
      adapterState,
    };

    const streamCallbacks: ToolStreamCallbacks = {
      onChunk: () => {},                       // suppressed — no Phase 1 text to UI
      onMediaPart: undefined,
      onToolCall: (event: ToolCallEvent) => {
        pendingToolCalls = event.toolCalls;
        textBefore = event.textBefore;
      },
    };

    // All adapters: single pass, fires onToolCall if tools requested, returns.
    const result = await adapter.chatStreamWithTools!(streamOptions, streamCallbacks);
    if (result?.adapterState) {
      adapterState = result.adapterState;
    }

    // LLM decided: no more tools needed → done
    if (!pendingToolCalls || pendingToolCalls.length === 0) break;

    // Record tool calls in buffer for history reconstruction on next round
    buffer.addAssistantToolCalls(pendingToolCalls, textBefore);

    // Execute tools in parallel, report activity to UI
    const results = await Promise.all(
      pendingToolCalls.map(async (call) => {
        if (signal?.aborted) {
          return { toolCallId: call.id, content: '', isError: true } as ToolResult;
        }

        const activity: ToolActivity = {
          toolName: call.name,
          label: toolLabel(call.name, 'calling'),
          status: 'calling',
          toolCall: call,
        };
        onToolActivity(activity);

        const result = await toolExecutor.execute(call, { historyItems, signal });
        allToolResults.push(result);
        onToolActivity({ ...activity, status: 'done', result });
        return result;
      })
    );

    buffer.addToolResults(results);
  }

  return assembleRetrievalContext(allToolResults);
}

// ── Phase 2 ────────────────────────────────────────────────────────────────

async function synthesisPhase(params: {
  adapter: ILLMAdapter;
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
  const { adapter, resolved, messages, systemPrompt, outputSchema,
          webSearchEnabled, signal, retrievalContext, onChunk, onMediaPart } = params;

  // Append retrieved context to the full system prompt (identity + JSON schema + @mention context).
  const synthesisPrompt = retrievalContext
    ? `${systemPrompt}\n\n${retrievalContext}`
    : systemPrompt;

  // Fresh buffer — no tool history needed, tools are suppressed via toolChoice: 'none'
  const buffer = new MessageBuffer(messages);

  const streamOptions: ToolStreamOptions = {
    messages: buffer.getMessages(),
    resolved,
    systemPrompt: synthesisPrompt,
    webSearchEnabled,
    signal,
    tools: undefined,
    toolMessages: [],
    outputSchema,
    toolChoice: 'none',
  };

  const streamCallbacks: ToolStreamCallbacks = {
    onChunk,
    onMediaPart,
    onToolCall: () => {},                      // should never fire with toolChoice:'none'
  };

  const result = await adapter.chatStreamWithTools!(streamOptions, streamCallbacks);
  const iterationUsage = result?.tokenUsage;

  if (iterationUsage) {
    return {
      inputTokens: iterationUsage.inputTokens,
      outputTokens: iterationUsage.outputTokens,
    };
  }
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

  const adapter = getAdapter(getProviderType(resolved.provider));

  if (!adapter.chatStreamWithTools) {
    throw new Error(`Adapter for ${resolved.provider} does not support tool calling.`);
  }

  const schemas = toolRegistry.getSchemas();
  const effectiveToolChoice: ToolChoice = toolChoice ?? 'auto';

  // ── Phase 1: Retrieval ────────────────────────────────────────────────────
  const retrievalContext = await retrievalPhase({
    adapter, resolved, messages, historyItems, signal,
    webSearchEnabled: false,   // web search conflicts with function calling in retrieval (Gemini hard error; wrong routing on others)
    schemas,
    toolChoice: effectiveToolChoice,
    onToolActivity,
  });

  // ── Phase 2: Synthesis ────────────────────────────────────────────────────
  const tokenUsage = await synthesisPhase({
    adapter, resolved, messages, systemPrompt, outputSchema,
    webSearchEnabled, signal, retrievalContext,
    onChunk, onMediaPart,
  });

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage,
  };
}
