/** Agentic tool loop: one streamText call where the LLM picks tools; called only by chatStore.sendMessage(). */

import { missingKey } from '@services/ai/jobModel';
import { streamText, isStepCount } from 'ai';
import type { ModelMessage, TextStreamPart, ToolSet } from 'ai';
import { createModel, reasoningCallSettings, toSDKMessages, getWebSearchTools, toExecutableTools } from '@services/ai';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { fitsJob, profileOf } from '@services/ai/models';
import { followModelLoad, generationStats, promptProgress } from '@services/ai/llamaServer';
import { listStyleOf } from '@services/providers/listers';
import { followMlxLoad } from '@services/mlx.service';
import { toolRegistry, loadMcpSettings, loadMcpTools, generateImageTool, GENERATE_IMAGE_TOOL } from '@extensions/tools';
import type { McpSettings } from '@config/mcp.config';
import { hasImageModel } from '@services/ai/image';
import { chatToolPreferences } from '@config/chatTools.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { extractTokenUsage } from '@services/ai/types';
import type { GenerationStats, StreamProgress, TokenUsage } from '@services/ai/types';
import type { ContextTokens } from '@shared/types';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';
import { toolActivityOf } from './toolActivity';
import type { ToolSources } from './toolActivity';
import { finalStepGuard } from './stepGuard';
import { buildChatSystemPrompt, NO_TOOLS } from '@core/ai';
import type { ChatToolset } from '@core/ai';

/** Separates a model's thinking blocks (OpenAI streams each reasoning summary as its own block). */
const REASONING_BLOCK_BREAK = '\n\n';

/** Drops provider citation markers only while web search is on, so code like `arr[0]` survives otherwise. */
export function stripWebCitations(text: string, webSearchActive: boolean): string {
  if (!webSearchActive) return text;
  return text.replace(/<\/?cite[^>]*>/g, '').replace(/\[(\d+)\](?!\()/g, '');
}

/** The chat's model, ready to call — or why it can't run. */
function chatModelOrThrow(resolved: ResolvedModel): ResolvedModel {
  const keyProblem = missingKey(resolved);
  if (keyProblem) throw keyProblem;
  if (!fitsJob(profileOf(resolved.provider, resolved.model), 'chat')) {
    throw new Error(`${getModelDisplayName(resolved.model)} doesn't chat (it doesn't take and give text). Pick a chat model.`);
  }
  return resolved;
}

interface ChatTools {
  /** Built-in + enabled MCP tools plus web search; undefined when none, since some providers reject an empty set. */
  tools: ToolSet | undefined;
  /** Which MCP server each MCP tool came from, for its row in chat. */
  sources: ToolSources;
  /** The tool groups sent, so the system prompt guides exactly these. */
  toolset: ChatToolset;
}

async function buildTools(options: OrchestratorOptions, webSearchTools: ToolSet | undefined, mcpSettings: McpSettings): Promise<ChatTools> {
  const webSearch = !!webSearchTools;
  const none: ChatTools = { tools: webSearchTools, sources: new Map(), toolset: { ...NO_TOOLS, webSearch } };
  if (options.skipRetrieval) return none;
  const { settings, providers } = options;
  const prefs = chatToolPreferences(settings);
  const reservedNames = new Set([...toolRegistry.getToolNames(), GENERATE_IMAGE_TOOL]);
  const meetingTools = prefs.meetingTools ? toolRegistry.getTools() : [];
  const imageTools = hasImageModel(settings) && prefs.imageGeneration ? [generateImageTool({ settings, providers })] : [];
  const mcpTools = await loadMcpTools(reservedNames, mcpSettings, new Set(prefs.disabledMcpTools));
  const definitions = [...meetingTools, ...imageTools, ...mcpTools];
  if (definitions.length === 0) return none;
  const rociTools = toExecutableTools(definitions, { signal: options.signal, approval: 'chat' });
  const sources = new Map(definitions.flatMap((d) => (d.source ? [[d.name, d.source] as const] : [])));
  const apps = [...new Set(mcpTools.flatMap((t) => (t.source ? [t.source] : [])))];
  const toolset = { meetings: meetingTools.length > 0, webSearch, image: imageTools.length > 0, apps };
  return { tools: { ...rociTools, ...webSearchTools }, sources, toolset };
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

/** Model loads show in the reply header: llama-server's staged progress, MLX's start (followed before the request); returns the stop. */
async function followLoad(resolved: ResolvedModel, llamaServer: boolean, showProgress: (progress: StreamProgress) => void): Promise<() => void> {
  if (llamaServer) return followModelLoad(resolved.baseUrl, resolved.modelId, showProgress);
  if (getProviderType(resolved.provider) === 'on-device') return followMlxLoad(resolved.modelId, showProgress);
  return () => undefined;
}

/** Runs the agentic loop: the LLM decides which meeting, MCP and web search tools to call, and when to answer. */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks,
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage; context?: ContextTokens; exchange: ModelMessage[]; toolset: ChatToolset }> {
  const { messages, model, prompt, settings, signal, reasoningEffort } = options;
  const { onChunk } = callbacks;

  const resolved = chatModelOrThrow(model);
  const webSearchTools = chatToolPreferences(settings).webSearch ? getWebSearchTools(resolved) : undefined;
  const mcpSettings = await loadMcpSettings();
  const { tools, sources: toolSources, toolset } = await buildTools(options, webSearchTools, mcpSettings);
  const { input, output } = profileOf(resolved.provider, resolved.model);
  const systemPrompt = buildChatSystemPrompt({ ...prompt, tools: toolset, modalities: { input, output } });
  const { maxToolCalls } = mcpSettings;
  // A local llama-server reports loading the model and reading the prompt before it replies.
  const reportsProgress = (await listStyleOf(resolved.provider, { baseUrl: resolved.baseUrl })) === 'llama-server';

  const stopFollowingLoad = await followLoad(resolved, reportsProgress, (progress) => onChunk('', { progress }));

  const state: StreamState = { hasText: false, hasReasoning: false, sources: [] };
  // From the subscription on, the listener is released however the request ends (including a throw while it's set up).
  try {
    const result = streamText({
      model: createModel(resolved, { webSearch: !!webSearchTools, ...(reportsProgress && { llamaServer: { reasoningEffort } }) }),
      ...reasoningCallSettings(resolved, reasoningEffort),
      instructions: systemPrompt,
      messages: toSDKMessages(messages, Object.keys(tools ?? {})),
      abortSignal: signal,
      includeRawChunks: reportsProgress,
      ...(tools && {
        tools,
        toolChoice: 'auto' as const,
        prepareStep: finalStepGuard(maxToolCalls),
        // Every step before the answer calls at least one tool, so the guard has turned tools off by this count.
        stopWhen: isStepCount(maxToolCalls + 1),
      }),
    });

    for await (const part of result.stream) {
      if (signal?.aborted) break;
      handlePart(part, state, callbacks, { webSearchActive: !!webSearchTools, toolSources });
    }

    if (!state.hasText && !signal?.aborted) throw emptyResponseError(await result.finishReason);
    if (state.sources.length > 0) onChunk('', { webCitations: state.sources });

    return {
      provider: resolved.provider,
      model: resolved.modelId,
      tokenUsage: extractTokenUsage(await result.usage),
      context: contextOf((await result.steps).at(-1)?.usage),
      exchange: await result.responseMessages,
      toolset,
    };
  } finally {
    stopFollowingLoad();
    if (reportsProgress) learnTemplateCapabilities(resolved);
  }
}

/** The window after the reply is its last call's prompt and reply; `usage` sums every tool step, so it can't say this. */
function contextOf(usage: Parameters<typeof extractTokenUsage>[0] | undefined): ContextTokens | undefined {
  if (!usage?.inputTokens) return undefined;
  const { inputTokens = 0, outputTokens = 0, cacheReadTokens = 0 } = extractTokenUsage(usage);
  return { prompt: inputTokens, cached: cacheReadTokens, reply: outputTokens };
}

/** llama-server reports tool support only while a model is loaded; after a reply it is, so re-probe until its support is known. */
function learnTemplateCapabilities(resolved: ResolvedModel): void {
  if (resolved.model.reported?.tools !== undefined) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.localServersAll() }).catch((error: unknown) =>
    console.error('[orchestrate] Re-probing local servers failed:', error));
}
