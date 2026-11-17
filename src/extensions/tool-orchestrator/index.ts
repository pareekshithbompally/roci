/** Agentic tool loop: one streamText call where the LLM picks tools; called only by chatStore.sendMessage(). */

import { streamText, isStepCount } from 'ai';
import type { TextStreamPart, ToolSet } from 'ai';
import { createModel, reasoningCallSettings, toSDKMessages, getWebSearchTools, toExecutableTools } from '@services/ai';
import { resolveChatModel, requiresApiKey } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { followModelLoad, generationStats, isLlamaServer, promptProgress } from '@services/ai/llamaServer';
import { followMlxLoad } from '@services/mlx.service';
import { getProviderType } from '@shared/utils/modelResolver';
import { toolRegistry, loadMcpTools, generateImageTool, GENERATE_IMAGE_TOOL } from '@extensions/tools';
import { hasImageModel } from '@services/ai/image';
import { AGENT_LOOP_CONFIG, DEFAULT_CHAT_TOOLS } from '@config/chatTools.config';
import { extractTokenUsage } from '@services/ai/types';
import type { GenerationStats, StreamProgress, TokenUsage } from '@services/ai/types';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';
import { toolActivityOf } from './toolActivity';
import type { ToolSources } from './toolActivity';
import { prepareFinalStep } from './stepGuard';

/** Separates a model's thinking blocks (OpenAI streams each reasoning summary as its own block). */
const REASONING_BLOCK_BREAK = '\n\n';

/** Drops provider citation markers only while web search is on, so code like `arr[0]` survives otherwise. */
export function stripWebCitations(text: string, webSearchActive: boolean): string {
  if (!webSearchActive) return text;
  return text.replace(/<\/?cite[^>]*>/g, '').replace(/\[(\d+)\](?!\()/g, '');
}

/** The chat model, ready to call — or why it can't run. */
function chatModelOrThrow(settings: OrchestratorOptions['settings'], providers: OrchestratorOptions['providers']): ResolvedModel {
  const resolved = resolveChatModel(settings, providers);
  if (!resolved) {
    throw new Error(`Model "${settings.chatModel}" not found. Please configure a model in Settings → Providers.`);
  }
  if (requiresApiKey(resolved) && !resolved.apiKey) {
    throw new Error(`API key not configured for ${resolved.provider}. Please add it in Settings → Providers.`);
  }
  return resolved;
}

interface ChatTools {
  /** Built-in + enabled MCP tools plus web search; undefined when none, since some providers reject an empty set. */
  tools: ToolSet | undefined;
  /** Which MCP server each MCP tool came from, for its row in chat. */
  sources: ToolSources;
}

async function buildTools(options: OrchestratorOptions, webSearchTools: ToolSet | undefined): Promise<ChatTools> {
  const none: ChatTools = { tools: webSearchTools, sources: new Map() };
  if (options.skipRetrieval) return none;
  const { settings, providers } = options;
  const prefs = { ...DEFAULT_CHAT_TOOLS, ...settings.chatTools };
  const reservedNames = new Set([...toolRegistry.getToolNames(), GENERATE_IMAGE_TOOL]);
  const definitions = [
    ...(prefs.meetingTools ? toolRegistry.getTools() : []),
    ...(hasImageModel(settings) && prefs.imageGeneration ? [generateImageTool({ settings, providers, sessionId: options.sessionId })] : []),
    ...(await loadMcpTools(reservedNames, new Set(prefs.disabledMcpTools))),
  ];
  if (definitions.length === 0) return none;
  const rociTools = toExecutableTools(definitions, { historyItems: options.historyItems, signal: options.signal, approval: 'chat' });
  const sources = new Map(definitions.flatMap((d) => (d.source ? [[d.name, d.source] as const] : [])));
  return { tools: { ...rociTools, ...webSearchTools }, sources };
}

interface StreamState {
  hasText: boolean;
  /** The last thing streamed was thinking text, so a new thinking block starts a new paragraph. */
  hasReasoning: boolean;
  sources: Array<{ url: string; title: string }>;
  /** Latest tokens-so-far and speed llama-server reported (its chunks arrive just before the text they carry). */
  generation?: GenerationStats;
}

/** llama-server's own chunk: prompt-reading progress is shown, generation stats are kept for the thinking that follows. */
function handleRaw(chunk: unknown, state: StreamState, onChunk: OrchestratorCallbacks['onChunk']): void {
  const progress = promptProgress(chunk);
  if (progress) onChunk('', { progress });
  state.generation = generationStats(chunk) ?? state.generation;
}

/** One stream part → UI callbacks and collected state. Throws on a stream error. */
function handlePart(
  part: TextStreamPart<ToolSet>,
  state: StreamState,
  callbacks: OrchestratorCallbacks,
  context: { webSearchActive: boolean; toolSources: ToolSources },
): void {
  const { onChunk } = callbacks;
  const activity = toolActivityOf(part, context.toolSources);
  if (activity) {
    state.hasReasoning = false;
    callbacks.onToolActivity(activity);
    return;
  }
  switch (part.type) {
    case 'text-delta': {
      state.hasText = true;
      state.hasReasoning = false;
      const text = stripWebCitations(part.text, context.webSearchActive);
      if (text) onChunk(text);
      return;
    }
    case 'reasoning-start':
      if (state.hasReasoning) callbacks.onReasoning(REASONING_BLOCK_BREAK, state.generation);
      return;
    case 'reasoning-delta':
      state.hasReasoning ||= part.text.length > 0;
      callbacks.onReasoning(part.text, state.generation);
      return;
    case 'source':
      if (part.sourceType === 'url') state.sources.push({ url: part.url, title: part.title || '' });
      return;
    case 'raw':
      handleRaw(part.rawValue, state, onChunk);
      return;
    case 'error':
      console.error('[Orchestrator] Stream error:', part.error);
      throw part.error instanceof Error ? part.error : new Error(String(part.error ?? 'Model returned a stream error'));
  }
}

function emptyResponseError(finishReason: string | undefined): Error {
  console.warn('[Orchestrator] Produced no text. finishReason:', finishReason);
  return new Error(
    finishReason === 'content-filter'
      ? 'Response blocked by content filter.'
      : `Model produced no text response (finish reason: ${finishReason ?? 'unknown'}). This may indicate a tool loop exhaustion or an unsupported model.`,
  );
}

/** Runs the agentic loop: the LLM decides which meeting, MCP and web search tools to call, and when to answer. */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks,
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage }> {
  const { messages, systemPrompt, settings, providers, signal, webSearchEnabled, reasoningEffort } = options;
  const { onChunk } = callbacks;

  const resolved = chatModelOrThrow(settings, providers);
  const webSearchTools = webSearchEnabled ? getWebSearchTools(resolved) : undefined;
  const { tools, sources: toolSources } = await buildTools(options, webSearchTools);
  // A local llama-server reports loading the model and reading the prompt before it replies.
  const reportsProgress = isLocalProviderId(resolved.provider) && (await isLlamaServer(resolved.baseUrl));

  // Model loads show in the reply header: llama-server's staged progress, MLX's start (followed before the request).
  const showProgress = (progress: StreamProgress) => onChunk('', { progress });
  const stopFollowingLoad = reportsProgress
    ? followModelLoad(resolved.baseUrl, resolved.modelId, showProgress)
    : getProviderType(resolved.provider) === 'on-device'
      ? await followMlxLoad(resolved.modelId, showProgress)
      : () => undefined;

  const result = streamText({
    model: createModel(resolved, { webSearch: !!webSearchTools, ...(reportsProgress && { llamaServer: { reasoningEffort } }) }),
    ...reasoningCallSettings(resolved, reasoningEffort),
    instructions: systemPrompt,
    messages: toSDKMessages(messages),
    abortSignal: signal,
    includeRawChunks: reportsProgress,
    ...(tools && {
      tools,
      toolChoice: 'auto' as const,
      prepareStep: prepareFinalStep,
      stopWhen: isStepCount(AGENT_LOOP_CONFIG.maxSteps),
    }),
  });

  const state: StreamState = { hasText: false, hasReasoning: false, sources: [] };
  try {
    for await (const part of result.stream) {
      if (signal?.aborted) break;
      handlePart(part, state, callbacks, { webSearchActive: !!webSearchTools, toolSources });
    }
  } finally {
    stopFollowingLoad();
  }

  if (!state.hasText && !signal?.aborted) throw emptyResponseError(await result.finishReason);
  if (state.sources.length > 0) onChunk('', { webCitations: state.sources });

  return {
    provider: resolved.provider,
    model: resolved.modelId,
    tokenUsage: extractTokenUsage(await result.usage),
  };
}
