/**
 * OpenAI-Compatible Adapter — openai SDK (Chat Completions API)
 *
 * For: Azure, Cohere, OpenRouter, Mistral, Groq, HuggingFace, xAI, local-server
 * Uses the openai SDK with custom baseURL and optional custom headers.
 */

import OpenAI from 'openai';
import { parseVTT } from '@/utils/vttParser';
import { getOrCreate } from './client-cache';
import { getPlatformFetch } from '../platform-fetch';
import { toOpenAIMessages } from './message-converter';
import {
  toProviderTools,
  parseOpenAICompatToolCalls,
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
} from './types';

function getClient(apiKey: string, baseURL: string, customHeaders?: Record<string, string>): OpenAI {
  return getOrCreate(apiKey, baseURL, () =>
    new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
      fetch: getPlatformFetch(),
      ...(customHeaders && Object.keys(customHeaders).length > 0 && {
        defaultHeaders: customHeaders,
      }),
    })
  );
}

/** Extract custom headers from provider config */
function buildCustomHeaders(providerConfig: any): Record<string, string> {
  const headers: Record<string, string> = {};
  if (providerConfig.custom_header) {
    for (const header of providerConfig.custom_header) {
      headers[header.header] = header.value;
    }
  }
  return headers;
}

export class OpenAICompatAdapter implements ILLMAdapter {
  readonly type = 'openai-compat' as const;

  async chatStream(options: ChatStreamOptions, callbacks: StreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, signal, outputSchema } = options;
    const { onChunk } = callbacks;

    if (signal?.aborted) return;

    if (!resolved.baseUrl) {
      throw new Error(
        `Base URL not configured for ${resolved.provider}. Please check Settings -> Providers.`
      );
    }

    const customHeaders = buildCustomHeaders(resolved.providerConfig);
    const client = getClient(resolved.apiKey, resolved.baseUrl, customHeaders);
    const openAIMessages = toOpenAIMessages(messages, systemPrompt);

    const runner = client.chat.completions
      .stream({
        model: resolved.modelId,
        messages: openAIMessages,
        ...(outputSchema && {
          response_format: {
            type: 'json_schema' as const,
            json_schema: {
              name: outputSchema.name || 'response',
              schema: outputSchema.schema,
              strict: true,
            },
          },
        }),
      })
      .on('content', (delta) => {
        onChunk(delta);
      });

    // Wire up abort signal — check pre-aborted first
    if (signal) {
      if (signal.aborted) {
        runner.abort();
        return;
      }
      const onAbort = () => runner.abort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const finalCompletion = await runner.finalChatCompletion();

    if (finalCompletion.usage) {
      return {
        inputTokens: finalCompletion.usage.prompt_tokens,
        outputTokens: finalCompletion.usage.completion_tokens,
      };
    }
  }

  async chatStreamWithTools(options: ToolStreamOptions, callbacks: ToolStreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, signal, tools: toolSchemas, toolMessages, outputSchema } = options;
    const { onChunk, onToolCall } = callbacks;

    if (signal?.aborted) return;

    if (!resolved.baseUrl) {
      throw new Error(
        `Base URL not configured for ${resolved.provider}. Please check Settings -> Providers.`
      );
    }

    const customHeaders = buildCustomHeaders(resolved.providerConfig);
    const client = getClient(resolved.apiKey, resolved.baseUrl, customHeaders);
    const openAIMessages: any[] = toOpenAIMessages(messages, systemPrompt);

    // Append tool turn messages (assistant tool_calls + tool results)
    if (toolMessages?.length) {
      for (const tm of toolMessages) {
        if (tm.role === 'assistant_tool_call') {
          const assistantMsg = toProviderAssistantToolCall(tm.toolCalls, tm.textBefore, 'openai-compat');
          if (assistantMsg) openAIMessages.push(assistantMsg);
        } else if (tm.role === 'tool_result') {
          const resultMsgs = toProviderToolResults(tm.results, [], 'openai-compat');
          openAIMessages.push(...resultMsgs);
        }
      }
    }

    // Build tools array
    const tools: any[] = [];
    if (toolSchemas?.length) {
      tools.push(...toProviderTools(toolSchemas, 'openai-compat'));
    }

    // Accumulate tool calls across stream chunks
    const accumulatedToolCalls = new Map<number, { id: string; function: { name: string; arguments: string } }>();
    let textBefore = '';

    const runner = client.chat.completions
      .stream({
        model: resolved.modelId,
        messages: openAIMessages,
        ...(tools.length > 0 && { tools }),
        ...(outputSchema && {
          response_format: {
            type: 'json_schema' as const,
            json_schema: {
              name: outputSchema.name || 'response',
              schema: outputSchema.schema,
              strict: true,
            },
          },
        }),
      })
      .on('chunk', (chunk: any) => {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) return;

        // Text content
        if (delta.content) {
          onChunk(delta.content);
          textBefore += delta.content;
        }

        // Tool call deltas — accumulate name + args per index
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!accumulatedToolCalls.has(idx)) {
              accumulatedToolCalls.set(idx, {
                id: tc.id || '',
                function: { name: '', arguments: '' },
              });
            }
            const acc = accumulatedToolCalls.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.function.name += tc.function.name;
            if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
          }
        }
      });

    if (signal) {
      if (signal.aborted) { runner.abort(); return; }
      signal.addEventListener('abort', () => runner.abort(), { once: true });
    }

    const finalCompletion = await runner.finalChatCompletion();

    // Check if tool calls were made
    const finishReason = finalCompletion.choices?.[0]?.finish_reason;
    if ((finishReason === 'tool_calls' || finishReason === 'stop') && accumulatedToolCalls.size > 0) {
      const toolCallsArr = Array.from(accumulatedToolCalls.values());
      const toolCalls = parseOpenAICompatToolCalls(toolCallsArr);
      if (toolCalls.length > 0) {
        onToolCall({ toolCalls, textBefore: textBefore || undefined });
      }
    }

    if (finalCompletion.usage) {
      return {
        inputTokens: finalCompletion.usage.prompt_tokens,
        outputTokens: finalCompletion.usage.completion_tokens,
      };
    }
  }

  async chat(options: ChatOptions): Promise<{ text: string }> {
    const { messages, resolved, systemPrompt, outputSchema } = options;

    if (!resolved.baseUrl) {
      throw new Error(
        `Base URL not configured for ${resolved.provider}. Please check Settings -> Providers.`
      );
    }

    const customHeaders = buildCustomHeaders(resolved.providerConfig);
    const client = getClient(resolved.apiKey, resolved.baseUrl, customHeaders);
    const openAIMessages = toOpenAIMessages(messages, systemPrompt);

    const response = await client.chat.completions.create({
      model: resolved.modelId,
      messages: openAIMessages,
      ...(outputSchema && {
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: outputSchema.name || 'response',
            schema: outputSchema.schema,
            strict: true,
          },
        },
      }),
    });

    return { text: response.choices?.[0]?.message?.content || 'No response.' };
  }

  async processAudio(options: TranscriptionOptions): Promise<string> {
    const { audioBlob, resolved } = options;

    if (!resolved.baseUrl) {
      throw new Error(
        `Base URL not configured for ${resolved.provider}. Please check Settings -> Providers.`
      );
    }

    const customHeaders = buildCustomHeaders(resolved.providerConfig);
    const client = getClient(resolved.apiKey, resolved.baseUrl, customHeaders);

    // Determine file extension
    let filename = 'audio.webm';
    if (audioBlob.type.includes('wav')) filename = 'audio.wav';
    else if (audioBlob.type.includes('mp3')) filename = 'audio.mp3';
    else if (audioBlob.type.includes('m4a')) filename = 'audio.m4a';

    const file = new File([audioBlob], filename, { type: audioBlob.type });

    const transcription = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    // Format transcript with timestamps if available
    const data = transcription as any;
    if (data.segments && Array.isArray(data.segments)) {
      return data.segments
        .map((seg: any) => {
          const mins = Math.floor(seg.start / 60);
          const secs = Math.floor(seg.start % 60);
          const ts = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          return `[${ts}] ${seg.text}`;
        })
        .join('\n');
    }

    return data.text || 'No transcription available.';
  }

  async processDocument(options: DocumentOptions): Promise<string> {
    const { file, resolved, prompt, outputSchema } = options;

    if (!resolved.baseUrl) {
      throw new Error(
        `Base URL not configured for ${resolved.provider}. Please check Settings -> Providers.`
      );
    }

    const customHeaders = buildCustomHeaders(resolved.providerConfig);
    const client = getClient(resolved.apiKey, resolved.baseUrl, customHeaders);

    // Parse VTT files to extract clean transcript text
    let textContent: string;
    if (file.name.endsWith('.vtt') || file.type === 'text/vtt') {
      const vttContent = await file.text();
      const parsed = parseVTT(vttContent);
      textContent = `Transcript:\n${parsed.fullText}`;
    } else {
      textContent = await file.text();
    }

    const response = await client.chat.completions.create({
      model: resolved.modelId,
      messages: [
        { role: 'system', content: 'You are a professional meeting analyst.' },
        { role: 'user', content: `${textContent}\n\n${prompt}` },
      ],
      ...(outputSchema && {
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: outputSchema.name || 'response',
            schema: outputSchema.schema,
            strict: true,
          },
        },
      }),
    });

    return response.choices?.[0]?.message?.content || 'No response.';
  }
}
