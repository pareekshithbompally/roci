/**
 * Anthropic Adapter — @anthropic-ai/sdk
 *
 * Handles: chat, chatStream
 * Features: extended thinking, web search
 * Note: processAudio/processDocument not natively supported — throws helpful error
 */

import Anthropic from '@anthropic-ai/sdk';
import { getOrCreate } from './client-cache';
import { getPlatformFetch } from '../platform-fetch';
import { toAnthropicMessages } from './message-converter';
import {
  toProviderTools,
  parseAnthropicToolCalls,
  toProviderToolResults,
  toProviderAssistantToolCall,
} from './tool-converter';
import type {
  ILLMAdapter,
  ChatStreamOptions,
  StreamCallbacks,
  ChatOptions,
  TranscriptionOptions,
  DocumentOptions,
  ToolStreamOptions,
  ToolStreamCallbacks,
  TokenUsage,
  AdapterStreamResult,
} from './types';

function getClient(apiKey: string): Anthropic {
  return getOrCreate(apiKey, undefined, () =>
    new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: getPlatformFetch() })
  );
}

/** Collect web search results from an Anthropic content block into a target array.
 *  The SDK shape is: { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url, title, ... }] }
 */
function collectWebSearchResults(
  block: any,
  target: Array<{ url: string; title: string }>
): void {
  if (block?.type !== 'web_search_tool_result') return;

  // Anthropic uses `content` (array of web_search_result objects), NOT `search_results`
  const results = block.content;
  if (!Array.isArray(results)) return;

  for (const result of results) {
    if (result.url) {
      target.push({ url: result.url, title: result.title || '' });
    }
  }
}

export class AnthropicAdapter implements ILLMAdapter {
  readonly type = 'anthropic' as const;

  async chatStream(options: ChatStreamOptions, callbacks: StreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, outputSchema } = options;
    const { onChunk } = callbacks;

    if (signal?.aborted) return;

    const client = getClient(resolved.apiKey);
    const anthropicMessages = toAnthropicMessages(messages);

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: 'web_search_20250305', name: 'web_search' });
    }

    const stream = client.messages.stream({
      model: resolved.modelId,
      max_tokens: 8192,
      system: systemPrompt,
      messages: anthropicMessages,
      ...(tools.length > 0 && { tools }),
      ...(outputSchema && {
        output_config: {
          format: {
            type: 'json_schema' as const,
            schema: outputSchema.schema,
          },
        },
      }),
    });

    // Wire up abort signal — check pre-aborted first
    if (signal) {
      if (signal.aborted) {
        stream.abort();
        return;
      }
      const onAbort = () => stream.abort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const collectedWebCitations: Array<{ url: string; title: string }> = [];

    for await (const event of stream) {
      if (signal?.aborted) break;

      if (event.type === 'content_block_start') {
        const block = (event as any).content_block;
        collectWebSearchResults(block, collectedWebCitations);
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          onChunk('', {
            isThinking: true,
            thinkingContent: (event.delta as any).thinking || '',
          });
        } else if (event.delta.type === 'text_delta') {
          onChunk((event.delta as any).text || '');
        }
      }
    }

    if (collectedWebCitations.length > 0) {
      onChunk('', { webCitations: collectedWebCitations });
    }

    const finalMessage = await stream.finalMessage();
    if (finalMessage.usage) {
      return {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };
    }
  }

  async chat(options: ChatOptions): Promise<{ text: string }> {
    const { messages, resolved, systemPrompt, outputSchema } = options;
    const client = getClient(resolved.apiKey);

    const anthropicMessages = toAnthropicMessages(messages);

    const response = await client.messages.create({
      model: resolved.modelId,
      max_tokens: 8192,
      system: systemPrompt,
      messages: anthropicMessages,
      ...(outputSchema && {
        output_config: {
          format: {
            type: 'json_schema' as const,
            schema: outputSchema.schema,
          },
        },
      }),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return { text: textBlock ? (textBlock as any).text : 'No response.' };
  }

  async chatStreamWithTools(options: ToolStreamOptions, callbacks: ToolStreamCallbacks): Promise<AdapterStreamResult | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, tools: toolSchemas, toolMessages, toolChoice, outputSchema } = options;
    const { onChunk, onToolCall } = callbacks;

    if (signal?.aborted) return;

    const client = getClient(resolved.apiKey);
    const anthropicMessages = toAnthropicMessages(messages);

    // Append tool turn messages (assistant tool_use + user tool_result)
    if (toolMessages?.length) {
      let pendingToolCalls: import('@extensions/tools/types').ToolCall[] = [];
      for (const tm of toolMessages) {
        if (tm.role === 'assistant_tool_call') {
          pendingToolCalls = tm.toolCalls;
          const assistantMsg = toProviderAssistantToolCall(tm.toolCalls, tm.textBefore, 'anthropic');
          if (assistantMsg) anthropicMessages.push(assistantMsg);
        } else if (tm.role === 'tool_result') {
          const resultMsgs = toProviderToolResults(tm.results, pendingToolCalls, 'anthropic');
          anthropicMessages.push(...resultMsgs);
          pendingToolCalls = [];
        }
      }
    }

    // Build tools array — omit entirely when toolChoice is 'none'
    const tools: any[] = [];
    if (toolChoice !== 'none') {
      if (webSearchEnabled) {
        tools.push({ type: 'web_search_20250305', name: 'web_search' });
      }
      if (toolSchemas?.length) {
        tools.push(...toProviderTools(toolSchemas, 'anthropic'));
      }
    }

    // Map toolChoice to Anthropic's tool_choice format
    // Anthropic: { type: 'auto' } | { type: 'any' } (required) | omit (none)
    const anthropicToolChoice = toolChoice === 'required' ? { type: 'any' as const }
      : toolChoice === 'auto' ? { type: 'auto' as const }
      : undefined;

    const stream = client.messages.stream({
      model: resolved.modelId,
      max_tokens: 8192,
      system: systemPrompt,
      messages: anthropicMessages,
      ...(tools.length > 0 && { tools }),
      ...(tools.length > 0 && anthropicToolChoice && { tool_choice: anthropicToolChoice }),
      ...(outputSchema && {
        output_config: {
          format: {
            type: 'json_schema' as const,
            schema: outputSchema.schema,
          },
        },
      }),
    });

    if (signal) {
      if (signal.aborted) { stream.abort(); return; }
      signal.addEventListener('abort', () => stream.abort(), { once: true });
    }

    // Accumulate tool_use blocks and web citations during streaming
    const pendingToolBlocks: Array<{ id: string; name: string; inputJson: string }> = [];
    const collectedWebCitations: Array<{ url: string; title: string }> = [];
    let currentToolBlockIdx = -1;
    let textBefore = '';
    let stopReason = '';

    for await (const event of stream) {
      if (signal?.aborted) break;

      if (event.type === 'content_block_start') {
        const block = (event as any).content_block;
        if (block?.type === 'tool_use') {
          currentToolBlockIdx = pendingToolBlocks.length;
          pendingToolBlocks.push({ id: block.id, name: block.name, inputJson: '' });
        }
        collectWebSearchResults(block, collectedWebCitations);
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const text = (event.delta as any).text || '';
          onChunk(text);
          textBefore += text;
        } else if (event.delta.type === 'thinking_delta') {
          onChunk('', { isThinking: true, thinkingContent: (event.delta as any).thinking || '' });
        } else if ((event.delta as any).type === 'input_json_delta') {
          if (currentToolBlockIdx >= 0) {
            pendingToolBlocks[currentToolBlockIdx].inputJson += (event.delta as any).partial_json || '';
          }
        }
      } else if (event.type === 'content_block_stop') {
        // Reset current tool block index
        currentToolBlockIdx = -1;
      } else if (event.type === 'message_delta') {
        stopReason = (event as any).delta?.stop_reason || '';
      }
    }

    if (collectedWebCitations.length > 0) {
      onChunk('', { webCitations: collectedWebCitations });
    }

    const finalMessage = await stream.finalMessage();

    // If stop reason is 'tool_use', emit collected tool calls
    if (stopReason === 'tool_use' && pendingToolBlocks.length > 0) {
      const parsedBlocks = pendingToolBlocks.map(b => ({
        id: b.id,
        name: b.name,
        input: safeParseJSON(b.inputJson),
      }));
      const toolCalls = parseAnthropicToolCalls(parsedBlocks);
      onToolCall({ toolCalls, textBefore: textBefore || undefined });
    }

    if (finalMessage.usage) {
      return {
        tokenUsage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    }
  }

  async processAudio(_options: TranscriptionOptions): Promise<string> {
    throw new Error(
      'Anthropic does not support audio transcription natively. ' +
      'Please use a Gemini or OpenAI model for transcription.'
    );
  }

  async processDocument(_options: DocumentOptions): Promise<string> {
    throw new Error(
      'Anthropic document processing is not yet implemented in this adapter. ' +
      'Please use a Gemini model for document processing.'
    );
  }
}

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
