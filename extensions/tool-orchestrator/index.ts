/**
 * Tool Orchestrator
 *
 * Two-phase design:
 *  Phase 1 — retrievalPhase(): lean retrieval prompt, tools available (parallel), text suppressed from UI.
 *  Phase 2 — synthesisPhase(): full system prompt + retrieved context, no tools, streams to user.
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

const MAX_RETRIEVAL_ROUNDS = 2;  // breadth (round 1) + depth (round 2)
// MAX_SYNTHESIS_ROUNDS = 1 — synthesis is always single-pass

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

  // Parallel tool executor — captures results for context assembly
  const executeTools = async (calls: ToolCall[]): Promise<ToolResult[]> => {
    if (signal?.aborted) return [];

    return Promise.all(
      calls.map(async (call) => {
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
  };

  const retrievalSystemPrompt = buildRetrievalSystemPrompt();

  for (let round = 0; round < MAX_RETRIEVAL_ROUNDS; round++) {
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
    };

    const streamCallbacks: ToolStreamCallbacks = {
      onChunk: () => {},                       // suppressed — no Phase 1 text to UI
      onMediaPart: undefined,
      onToolCall: (event: ToolCallEvent) => {
        pendingToolCalls = event.toolCalls;
        textBefore = event.textBefore;
      },
      executeTools,                            // used by Gemini's internal loop
    };

    // Gemini: runs its own multi-pass loop via executeTools callback, returns when done.
    // Non-Gemini: single pass, fires onToolCall, returns. Outer loop drives next round.
    await adapter.chatStreamWithTools!(streamOptions, streamCallbacks);

    if (!pendingToolCalls || pendingToolCalls.length === 0) break;

    buffer.addAssistantToolCalls(pendingToolCalls, textBefore);
    const results = await executeTools(pendingToolCalls);
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
    executeTools: undefined,
  };

  let accumulatedOutputTokens = 0;
  let lastInputTokens: number | undefined;

  const iterationUsage = await adapter.chatStreamWithTools!(streamOptions, streamCallbacks);
  if (iterationUsage) {
    accumulatedOutputTokens += iterationUsage.outputTokens || 0;
    lastInputTokens = iterationUsage.inputTokens;
  }

  return accumulatedOutputTokens > 0 || lastInputTokens != null
    ? { inputTokens: lastInputTokens, outputTokens: accumulatedOutputTokens || undefined }
    : undefined;
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
    webSearchEnabled, schemas,
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
