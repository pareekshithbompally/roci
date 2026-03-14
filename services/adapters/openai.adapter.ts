/**
 * OpenAI Adapter — openai SDK (Responses API)
 *
 * For first-party OpenAI models (gpt-4o, o-series, etc.).
 * Uses the Responses API for chat (streaming + non-streaming) with native web search.
 * Uses Chat Completions for processDocument (no Responses equivalent).
 * Uses Whisper API for processAudio.
 */

import OpenAI from 'openai';
import { parseVTT } from '@/utils/vttParser';
import { getOrCreate } from './client-cache';
import { getPlatformFetch } from '../platform-fetch';
import { toOpenAIResponsesInput } from './message-converter';
import { toProviderTools, parseOpenAIToolCalls, toProviderToolResults } from './tool-converter';
import type {
  ILLMAdapter,
  ChatStreamOptions,
  StreamCallbacks,
  ChatOptions,
  TranscriptionOptions,
  DocumentOptions,
  ToolStreamOptions,
  ToolStreamCallbacks,
  StreamMetadata,
  TokenUsage,
} from './types';
import { MANAGED_DEFAULT_URLS } from '../../consts/providers';

function getClient(apiKey: string, baseURL?: string): OpenAI {
  const url = baseURL || MANAGED_DEFAULT_URLS.openai;
  return getOrCreate(apiKey, url, () =>
    new OpenAI({ apiKey, baseURL: url, dangerouslyAllowBrowser: true, fetch: getPlatformFetch() })
  );
}

/** Extract web citations from OpenAI Responses API final response annotations */
function extractOpenAICitations(
  response: any
): Pick<StreamMetadata, 'webCitations' | 'inlineCitations'> | null {
  if (!response?.output) return null;

  const webCitations: Array<{ url: string; title: string }> = [];
  const inlineCitations: Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }> = [];
  const urlToIndex = new Map<string, number>();

  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of (item as any).content || []) {
      if (content.type !== 'output_text' || !Array.isArray(content.annotations)) continue;
      for (const ann of content.annotations) {
        if (ann.type !== 'url_citation' || !ann.url) continue;
        let sourceIdx = urlToIndex.get(ann.url);
        if (sourceIdx === undefined) {
          sourceIdx = webCitations.length;
          urlToIndex.set(ann.url, sourceIdx);
          webCitations.push({ url: ann.url, title: ann.title || '' });
        }
        if (typeof ann.start_index === 'number' && typeof ann.end_index === 'number') {
          inlineCitations.push({
            startIndex: ann.start_index,
            endIndex: ann.end_index,
            sourceIndices: [sourceIdx],
          });
        }
      }
    }
  }

  if (webCitations.length === 0) return null;

  return {
    webCitations,
    ...(inlineCitations.length > 0 && { inlineCitations }),
  };
}

export class OpenAIAdapter implements ILLMAdapter {
  readonly type = 'openai' as const;

  async chatStream(options: ChatStreamOptions, callbacks: StreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, outputSchema } = options;
    const { onChunk } = callbacks;

    if (signal?.aborted) return;

    const client = getClient(resolved.apiKey, resolved.baseUrl);
    const input = toOpenAIResponsesInput(messages, systemPrompt);

    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: 'web_search_preview' });
    }

    const runner = client.responses
      .stream({
        model: resolved.modelId,
        input,
        ...(tools.length > 0 && { tools }),
        ...(outputSchema && {
          text: {
            format: {
              type: 'json_schema' as const,
              name: outputSchema.name || 'response',
              schema: outputSchema.schema,
              strict: true,
            },
          },
        }),
      })
      .on('response.output_text.delta', (event: any) => {
        onChunk(event.delta);
      })
      .on('response.web_search_call.searching', () => {
        onChunk('', { isSearching: true });
      });

    // Wire up abort signal — check pre-aborted first
    if (signal) {
      if (signal.aborted) {
        runner.abort();
        return;
      }
      signal.addEventListener('abort', () => runner.abort(), { once: true });
    }

    const finalResponse = await runner.finalResponse();

    const citations = extractOpenAICitations(finalResponse);
    if (citations) {
      onChunk('', citations);
    }

    const usage = (finalResponse as any).usage;
    if (usage) {
      return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      };
    }
  }

  async chat(options: ChatOptions): Promise<{ text: string }> {
    const { messages, resolved, systemPrompt, outputSchema } = options;
    const client = getClient(resolved.apiKey, resolved.baseUrl);
    const input = toOpenAIResponsesInput(messages, systemPrompt);

    const response = await (client.responses as any).create({
      model: resolved.modelId,
      input,
      ...(outputSchema && {
        text: {
          format: {
            type: 'json_schema',
            name: outputSchema.name || 'response',
            schema: outputSchema.schema,
            strict: true,
          },
        },
      }),
    });

    return { text: response.output_text || 'No response.' };
  }

  async chatStreamWithTools(options: ToolStreamOptions, callbacks: ToolStreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, tools: toolSchemas, toolMessages, outputSchema } = options;
    const { onChunk, onToolCall } = callbacks;

    if (signal?.aborted) return;

    const client = getClient(resolved.apiKey, resolved.baseUrl);
    const input: any[] = toOpenAIResponsesInput(messages, systemPrompt);

    // Append tool turn messages (function calls + results)
    if (toolMessages?.length) {
      for (const tm of toolMessages) {
        if (tm.role === 'assistant_tool_call') {
          // OpenAI Responses API: function_call items become part of input
          for (const tc of tm.toolCalls) {
            input.push({
              type: 'function_call',
              call_id: tc.id,
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            });
          }
        } else if (tm.role === 'tool_result') {
          const resultItems = toProviderToolResults(tm.results, [], 'openai');
          input.push(...resultItems);
        }
      }
    }

    // Build tools array
    const tools: any[] = [];
    if (webSearchEnabled) {
      tools.push({ type: 'web_search_preview' });
    }
    if (toolSchemas?.length) {
      tools.push(...toProviderTools(toolSchemas, 'openai'));
    }

    // Accumulate function calls during streaming
    const functionCalls: Array<{ call_id: string; name: string; arguments: string }> = [];
    let textBefore = '';

    const runner = client.responses
      .stream({
        model: resolved.modelId,
        input,
        ...(tools.length > 0 && { tools }),
        ...(outputSchema && {
          text: {
            format: {
              type: 'json_schema' as const,
              name: outputSchema.name || 'response',
              schema: outputSchema.schema,
              strict: true,
            },
          },
        }),
      })
      .on('response.output_text.delta', (event: any) => {
        onChunk(event.delta);
        textBefore += event.delta;
      })
      .on('response.web_search_call.searching', () => {
        onChunk('', { isSearching: true });
      })
      .on('response.output_item.done', (event: any) => {
        if (event.item?.type === 'function_call') {
          functionCalls.push({
            call_id: event.item.call_id,
            name: event.item.name,
            arguments: event.item.arguments,
          });
        }
      });

    if (signal) {
      if (signal.aborted) { runner.abort(); return; }
      signal.addEventListener('abort', () => runner.abort(), { once: true });
    }

    const finalResponse = await runner.finalResponse();

    const citations = extractOpenAICitations(finalResponse);
    if (citations) {
      onChunk('', citations);
    }

    // If function calls were collected, emit them
    if (functionCalls.length > 0) {
      const toolCalls = parseOpenAIToolCalls(functionCalls);
      onToolCall({ toolCalls, textBefore: textBefore || undefined });
    }

    const usage = (finalResponse as any).usage;
    if (usage) {
      return {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      };
    }
  }

  async processAudio(options: TranscriptionOptions): Promise<string> {
    const { audioBlob, resolved } = options;
    const client = getClient(resolved.apiKey, resolved.baseUrl);

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
    const client = getClient(resolved.apiKey, resolved.baseUrl);

    // Parse VTT files to extract clean transcript text
    let textContent: string;
    if (file.name.endsWith('.vtt') || file.type === 'text/vtt') {
      const vttContent = await file.text();
      const parsed = parseVTT(vttContent);
      textContent = `Transcript:\n${parsed.fullText}`;
    } else {
      textContent = await file.text();
    }

    // processDocument still uses Chat Completions (no Responses equivalent)
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
