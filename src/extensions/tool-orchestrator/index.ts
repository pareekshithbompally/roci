/** Agentic tool loop: one streamText call where the LLM picks tools; called only by chatStore.sendMessage(). */

import { missingKey } from '@services/ai/jobModel';
import { streamText, isStepCount, readUIMessageStream, toUIMessageStream } from 'ai';
import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';
import { createModel, chatCallSettings, toModelMessages, getWebSearchTools, toExecutableTools } from '@services/ai';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { fitsJob, profileOf } from '@services/ai/models';
import type { ModelProfile } from '@services/ai/models';
import { modalitiesService } from '@services/modalities';
import { AiError } from '@services/ai/errors';
import { CHAT_CATALOG_COPY } from '@config/chat.config';
import { followModelLoad, generationStats, promptProgress } from '@services/ai/llamaServer';
import { listStyleOf } from '@services/providers/listers';
import { followMlxLoad } from '@services/mlx.service';
import { toolRegistry, loadMcpSettings, loadMcpTools, generateImageTool, GENERATE_IMAGE_TOOL, showTool, suggestMemoryTool } from '@extensions/tools';
import { memoryEnabled } from '@shared/utils/personalization';
import type { McpSettings } from '@config/mcp.config';
import { hasImageModel } from '@services/ai/image';
import { chatToolPreferences } from '@config/chatTools.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { extractTokenUsage } from '@services/ai/types';
import type { StreamProgress, TokenUsage } from '@services/ai/types';
import type { AppSettings, ChatPart, ChatUIMessage, ContextTokens } from '@shared/types';
import { errorMessage } from '@shared/utils/errors';
import { messageText } from '@shared/utils/chatParts';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';
import { finalStepGuard } from './stepGuard';
import { buildChatSystemPrompt, NO_TOOLS } from '@core/ai';
import type { ChatToolset } from '@core/ai';

/** Drops provider citation markers; used only while web search is on, so code like `arr[0]` survives otherwise. */
export function stripWebCitations(text: string): string {
  return text.replace(/<\/?cite[^>]*>/g, '').replace(/\[(\d+)\](?!\()/g, '');
}

/** The answer without citation markers, everywhere it goes: the screen, the saved chat, the next step's input. */
const withoutCitationMarkers: StreamTextTransform<ToolSet> = () =>
  new TransformStream({
    transform(part, controller) {
      controller.enqueue(part.type === 'text-delta' ? { ...part, text: stripWebCitations(part.text) } : part);
    },
  });

/** The models.dev list (what each model can do) before the chat reads it; the reply says so while it's fetched. */
async function loadModelFacts(onProgress: OrchestratorCallbacks['onProgress']): Promise<void> {
  if (modalitiesService.isLoaded()) return;
  onProgress({ stage: 'loading-catalog', percent: null });
  await modalitiesService.ensureLoaded();
  if (!modalitiesService.isLoaded()) throw new AiError('network', CHAT_CATALOG_COPY.unavailable);
  // Back to the plain "working" line until the model's first word.
  onProgress(null);
}

/** The chat's model, ready to call — or why it can't run. */
function chatModelOrThrow(resolved: ResolvedModel, profile: ModelProfile): ResolvedModel {
  const keyProblem = missingKey(resolved);
  if (keyProblem) throw keyProblem;
  if (!fitsJob(profile, 'chat')) {
    throw new Error(`${getModelDisplayName(resolved.model)} doesn't chat (it doesn't take and give text). Pick a chat model.`);
  }
  return resolved;
}

interface ChatTools {
  /** Built-in + enabled MCP tools plus web search; undefined when none, since some providers reject an empty set. */
  tools: ToolSet | undefined;
  /** The tool groups sent, so the system prompt guides exactly these. */
  toolset: ChatToolset;
}

/** The built-in tool groups the user's settings turn on, before the model and connected apps are known (chat sends these to
 *  a model that takes tools; the prompt preview shows them). */
export function selectedToolset(settings: AppSettings): Pick<ChatToolset, 'meetings' | 'image' | 'views' | 'memory'> {
  const prefs = chatToolPreferences(settings);
  return { meetings: prefs.meetingTools, image: prefs.imageGeneration && hasImageModel(settings), views: prefs.resultViews, memory: memoryEnabled(settings) };
}

/** Roci's tools go only to a model that takes tools; the provider's own web search goes either way. */
async function buildTools(options: OrchestratorOptions, webSearchTools: ToolSet | undefined, mcpSettings: McpSettings, takesTools: boolean): Promise<ChatTools> {
  const webSearch = !!webSearchTools;
  const none: ChatTools = { tools: webSearchTools, toolset: { ...NO_TOOLS, webSearch } };
  if (!takesTools) return none;
  const { settings, providers } = options;
  const on = selectedToolset(settings);
  const memoryTools = on.memory ? [suggestMemoryTool] : [];
  const viewTools = on.views ? [showTool] : [];
  const reservedNames = new Set([...toolRegistry.getToolNames(), GENERATE_IMAGE_TOOL, showTool.name, ...memoryTools.map((t) => t.name)]);
  const meetingTools = on.meetings ? toolRegistry.getTools() : [];
  const imageTools = on.image ? [generateImageTool({ settings, providers })] : [];
  const mcpTools = await loadMcpTools(reservedNames, mcpSettings, new Set(chatToolPreferences(settings).disabledMcpTools));
  const definitions = [...meetingTools, ...imageTools, ...viewTools, ...memoryTools, ...mcpTools];
  if (definitions.length === 0) return none;
  const rociTools = toExecutableTools(definitions, { signal: options.signal, approval: 'chat', sessionId: options.sessionId });
  const apps = [...new Set(mcpTools.flatMap((t) => (t.source ? [t.source] : [])))];
  const toolset = { meetings: meetingTools.length > 0, webSearch, image: imageTools.length > 0, views: viewTools.length > 0, apps, memory: memoryTools.length > 0 };
  return { tools: { ...rociTools, ...webSearchTools }, toolset };
}

/** llama-server's own chunk (raw, so outside the UI stream): prompt-reading progress, and tokens and speed while it generates. */
function handleRaw(chunk: unknown, callbacks: OrchestratorCallbacks): void {
  const progress = promptProgress(chunk);
  if (progress) callbacks.onProgress(progress);
  const stats = generationStats(chunk);
  if (stats) callbacks.onGeneration(stats);
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

/** Reads the reply as the SDK builds it, handing on its parts at each change. An error the stream reports is thrown as it
 *  came; a stream that breaks off rejects the result's own promises (usage, steps), which the caller awaits. */
async function readReply(
  stream: ReadableStream<TextStreamPart<ToolSet>>,
  tools: ToolSet | undefined,
  { messageId, signal }: Pick<OrchestratorOptions, 'messageId' | 'signal'>,
  onParts: OrchestratorCallbacks['onParts'],
): Promise<ChatPart[]> {
  let failure: unknown;
  const chunks = toUIMessageStream<ToolSet, ChatUIMessage>({
    stream,
    tools,
    sendSources: true,
    generateMessageId: () => messageId,
    onError: (error) => {
      failure ??= error;
      return errorMessage(error);
    },
    // The error text stays what the model was told, so the chat replays as it ran.
    redactToolErrors: false,
  });
  let parts: ChatPart[] = [];
  for await (const message of readUIMessageStream<ChatUIMessage>({ stream: chunks })) {
    if (signal?.aborted) break;
    parts = message.parts;
    onParts(parts);
  }
  if (failure !== undefined) throw failure;
  return parts;
}

/** Runs the agentic loop: the LLM decides which meeting, MCP and web search tools to call, and when to answer. */
export async function orchestrate(
  options: OrchestratorOptions,
  callbacks: OrchestratorCallbacks,
): Promise<{ provider?: string; model?: string; tokenUsage?: TokenUsage; context?: ContextTokens; parts: ChatPart[]; toolset: ChatToolset }> {
  const { messages, model, prompt, settings, signal, reasoningEffort } = options;

  await loadModelFacts(callbacks.onProgress);
  const profile = profileOf(model.provider, model.model);
  const resolved = chatModelOrThrow(model, profile);
  const webSearchTools = chatToolPreferences(settings).webSearch ? getWebSearchTools(resolved) : undefined;
  const mcpSettings = await loadMcpSettings();
  const { tools, toolset } = await buildTools(options, webSearchTools, mcpSettings, profile.tools);
  const { input, output } = profile;
  const systemPrompt = buildChatSystemPrompt({ ...prompt, tools: toolset, modalities: { input, output } });
  const { maxToolCalls } = mcpSettings;
  // A local llama-server reports loading the model and reading the prompt before it replies.
  const reportsProgress = (await listStyleOf(resolved.provider, { baseUrl: resolved.baseUrl })) === 'llama-server';

  const stopFollowingLoad = await followLoad(resolved, reportsProgress, callbacks.onProgress);

  // From the subscription on, the listener is released however the request ends (including a throw while it's set up).
  try {
    const result = streamText({
      model: createModel(resolved, { webSearch: !!webSearchTools, ...(reportsProgress && { llamaServer: { reasoningEffort } }) }),
      ...chatCallSettings(resolved, reasoningEffort),
      instructions: systemPrompt,
      messages: await toModelMessages(messages, tools ?? {}, input),
      abortSignal: signal,
      ...(webSearchTools && { experimental_transform: withoutCitationMarkers }),
      ...(reportsProgress && {
        include: { rawChunks: true },
        onChunk: ({ chunk }) => { if (chunk.type === 'raw') handleRaw(chunk.rawValue, callbacks); },
      }),
      ...(tools && {
        tools,
        toolChoice: 'auto' as const,
        prepareStep: finalStepGuard(maxToolCalls),
        // Every step before the answer calls at least one tool, so the guard has turned tools off by this count.
        stopWhen: isStepCount(maxToolCalls + 1),
      }),
    });

    const parts = await readReply(result.stream, tools, options, callbacks.onParts);
    if (!messageText({ parts }) && !signal?.aborted) throw emptyResponseError(await result.finishReason);

    return {
      provider: resolved.provider,
      model: resolved.modelId,
      tokenUsage: extractTokenUsage(await result.usage),
      context: contextOf((await result.steps).at(-1)?.usage),
      parts,
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
