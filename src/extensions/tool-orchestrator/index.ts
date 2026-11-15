/** Agentic tool loop: one streamText call where the LLM picks tools; called only by chatStore.sendMessage(). */

import { streamText, isStepCount } from 'ai';
import type { TextStreamPart, ToolSet } from 'ai';
import { createModel, toSDKMessages, getWebSearchTools, toExecutableTools } from '@services/ai';
import { resolveChatModel, requiresApiKey } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { followModelLoad, isLlamaServer, promptProgressPercent } from '@services/ai/llamaServer';
import { toolRegistry, loadMcpTools } from '@extensions/tools';
import { DEFAULT_CHAT_TOOLS } from '@config/chatTools.config';
import { extractTokenUsage } from '@services/ai/types';
import type { TokenUsage } from '@services/ai/types';
import type { OrchestratorOptions, OrchestratorCallbacks } from './types';

/** Safety cap for the agentic loop. Most queries resolve in 1–3 tool calls. */
const MAX_AGENT_STEPS = 10;

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

/** Built-in + enabled MCP tools plus web search; undefined when none, since some providers reject an empty set. */
async function buildTools(
  options: OrchestratorOptions,
  webSearchTools: ToolSet | undefined,
  onToolActivity: OrchestratorCallbacks['onToolActivity'],
): Promise<ToolSet | undefined> {
  if (options.skipRetrieval) return webSearchTools;
  const prefs = options.settings.chatTools ?? DEFAULT_CHAT_TOOLS;
  const definitions = [
    ...(prefs.meetingTools ? toolRegistry.getTools() : []),
    ...(await loadMcpTools(new Set(toolRegistry.getToolNames()), new Set(prefs.disabledMcpTools))),
  ];
  if (definitions.length === 0) return webSearchTools;
  const meetingTools = toExecutableTools(
    definitions,
    { historyItems: options.historyItems, signal: options.signal, approval: 'chat' },
    { onToolActivity },
  );
  return { ...meetingTools, ...webSearchTools };
}

interface StreamState {
  hasText: boolean;
  sources: Array<{ url: string; title: string }>;
}

/** One stream part → UI callbacks and collected state. Throws on a stream error. */
function handlePart(part: TextStreamPart<ToolSet>, state: StreamState, onChunk: OrchestratorCallbacks['onChunk'], webSearchActive: boolean): void {
  switch (part.type) {
    case 'text-delta': {
      state.hasText = true;
      const text = stripWebCitations(part.text, webSearchActive);
      if (text) onChunk(text);
      return;
    }
    case 'reasoning-delta':
      onChunk('', { isThinking: true, thinkingContent: part.text });
      return;
    // Only native web search runs on the provider's side; meeting and MCP tools are tracked in tools-bridge.
    case 'tool-input-start':
      if (part.providerExecuted) onChunk('', { isSearching: true });
      return;
    case 'source':
      if (part.sourceType === 'url') state.sources.push({ url: part.url, title: part.title || '' });
      return;
    // llama-server's own chunks (raw): how much of the prompt it has read.
    case 'raw': {
      const percent = promptProgressPercent(part.rawValue);
      if (percent !== null) onChunk('', { progress: { stage: 'reading-prompt', percent } });
      return;
    }
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
  const { messages, systemPrompt, settings, providers, signal, webSearchEnabled } = options;
  const { onChunk, onToolActivity } = callbacks;

  const resolved = chatModelOrThrow(settings, providers);
  const webSearchTools = webSearchEnabled ? getWebSearchTools(resolved) : undefined;
  const tools = await buildTools(options, webSearchTools, onToolActivity);
  // A local llama-server reports loading the model and reading the prompt before it replies.
  const reportsProgress = isLocalProviderId(resolved.provider) && (await isLlamaServer(resolved.baseUrl));

  const result = streamText({
    model: createModel(resolved, { webSearch: !!webSearchTools, promptProgress: reportsProgress }),
    instructions: systemPrompt,
    messages: toSDKMessages(messages),
    abortSignal: signal,
    includeRawChunks: reportsProgress,
    ...(tools && { tools, toolChoice: 'auto' as const, stopWhen: isStepCount(MAX_AGENT_STEPS) }),
  });

  const stopFollowingLoad = reportsProgress
    ? followModelLoad(resolved.baseUrl, resolved.modelId, (progress) => onChunk('', { progress }))
    : () => undefined;
  const state: StreamState = { hasText: false, sources: [] };
  try {
    for await (const part of result.stream) {
      if (signal?.aborted) break;
      handlePart(part, state, onChunk, !!webSearchTools);
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
