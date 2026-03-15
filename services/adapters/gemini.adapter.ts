/**
 * Gemini Adapter — @google/genai SDK
 *
 * Handles: chat, chatStream, processAudio, processDocument
 * Features: web search (Google Search grounding), image generation, multimodal output
 */

import { GoogleGenAI, Modality } from '@google/genai';
import type { ChatPart } from '@/types';
import { blobToBase64 } from '@/utils/audioUtils';
import { parseVTT } from '@/utils/vttParser';
import { getOrCreate } from './client-cache';
import { toGeminiHistory, toGeminiLastMessage } from './message-converter';
import { toProviderTools, parseGeminiToolCalls } from './tool-converter';
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

function getClient(apiKey: string): GoogleGenAI {
  return getOrCreate(apiKey, undefined, () => new GoogleGenAI({ apiKey }));
}

function isImageGenerationModel(modelId: string): boolean {
  return modelId.includes('-image');
}

function getMediaTypeFromMime(mimeType: string): 'image' | 'audio' | 'video' | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

/** Maximum tool-call/result passes within one agentic turn */
const MAX_TOOL_PASSES = 6;

function isToolsUnsupportedError(err: any): boolean {
  const msg = String(err?.message || '');
  return (
    msg.includes('Tool use with function calling is unsupported') ||
    (msg.includes('INVALID_ARGUMENT') && msg.toLowerCase().includes('unsupported'))
  );
}

/** Extract web citation data from a Gemini GroundingMetadata object */
function extractGroundingCitations(
  gm: any
): Pick<StreamMetadata, 'webCitations' | 'inlineCitations'> | null {
  if (!gm) return null;

  const groundingChunks = gm.groundingChunks;
  if (!Array.isArray(groundingChunks) || groundingChunks.length === 0) return null;

  const webCitations = groundingChunks
    .filter((gc: any) => gc.web?.uri)
    .map((gc: any) => ({ url: gc.web.uri, title: gc.web.title || '' }));

  if (webCitations.length === 0) return null;

  const result: Pick<StreamMetadata, 'webCitations' | 'inlineCitations'> = { webCitations };

  const supports = gm.groundingSupports;
  if (Array.isArray(supports) && supports.length > 0) {
    result.inlineCitations = supports
      .filter((s: any) => s.segment && Array.isArray(s.groundingChunkIndices))
      .map((s: any) => ({
        startIndex: s.segment.startIndex ?? 0,
        endIndex: s.segment.endIndex ?? 0,
        sourceIndices: s.groundingChunkIndices,
      }));
  }

  return result;
}

export class GeminiAdapter implements ILLMAdapter {
  readonly type = 'gemini' as const;

  async chatStream(options: ChatStreamOptions, callbacks: StreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, outputSchema } = options;
    const { onChunk, onMediaPart } = callbacks;
    const ai = getClient(resolved.apiKey);
    const isImageModel = isImageGenerationModel(resolved.modelId);

    const config: Record<string, unknown> = {};
    if (isImageModel) {
      config.responseModalities = [Modality.TEXT, Modality.IMAGE];
    } else {
      config.systemInstruction = systemPrompt;
      if (webSearchEnabled) {
        config.tools = [{ googleSearch: {} }];
      }
      if (outputSchema) {
        config.responseMimeType = 'application/json';
        config.responseJsonSchema = outputSchema.schema;
      }
    }

    const priorMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    const chat = ai.chats.create({
      model: resolved.modelId,
      config,
      ...(priorMessages.length > 0 && {
        history: toGeminiHistory(priorMessages),
      }),
    });

    const lastParts = toGeminiLastMessage(lastMessage);
    const stream = await chat.sendMessageStream({ message: lastParts });

    // Track whether the model signaled completion (finishReason on last chunk).
    // Only swallow teardown errors when the stream is semantically complete —
    // a mid-stream network drop (partial content, no finishReason) must still throw.
    let streamFinished = false;
    let lastUsageMetadata: any = null;
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) break;

        const finishReason = chunk.candidates?.[0]?.finishReason;
        if (finishReason) streamFinished = true;

        if ((chunk as any).usageMetadata) {
          lastUsageMetadata = (chunk as any).usageMetadata;
        }

        // DEBUG: Log chunk structure when web search is enabled
        if (webSearchEnabled) {
          const c0 = (chunk as any).candidates?.[0];
          console.log('[GeminiAdapter] chunk keys:', Object.keys(chunk as any));
          if (c0) console.log('[GeminiAdapter] candidate[0] keys:', Object.keys(c0));
          if (c0?.groundingMetadata) console.log('[GeminiAdapter] HAS groundingMetadata');
        }

        // Check for grounding metadata (web search) — lives on candidates[0], not top-level
        const chunkData = chunk as any;
        const metadata: any = {};
        const groundingMeta = chunkData.candidates?.[0]?.groundingMetadata;
        if (groundingMeta) {
          console.log('[GeminiAdapter] groundingMetadata found:', JSON.stringify(groundingMeta, null, 2));
          metadata.isSearching = true;
          if (groundingMeta.webSearchQueries?.[0]) {
            metadata.searchQuery = groundingMeta.webSearchQueries[0];
          }
          Object.assign(metadata, extractGroundingCitations(groundingMeta));
        }

        // Process all parts from the response candidates
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              onChunk(part.text, Object.keys(metadata).length > 0 ? metadata : undefined);
            } else if (part.inlineData?.data && part.inlineData?.mimeType && onMediaPart) {
              const mimeType = part.inlineData.mimeType;
              const mediaType = getMediaTypeFromMime(mimeType);
              if (mediaType) {
                onMediaPart({
                  type: mediaType,
                  mimeType,
                  source: { kind: 'data', base64: part.inlineData.data },
                } as ChatPart);
              }
            }
          }
        } else {
          const text = chunk.text || '';
          if (text) {
            onChunk(text, Object.keys(metadata).length > 0 ? metadata : undefined);
          }
        }
      }
    } catch (err: any) {
      // The async iterator calls .next() one final time after the last chunk.
      // If the underlying fetch connection drops during that close handshake,
      // it throws — but all content was already yielded and finishReason received.
      // Only swallow if the model explicitly signaled completion.
      if (streamFinished) {
        console.warn('[GeminiAdapter] Stream teardown error (response was complete):', err.message);
      } else {
        throw err;
      }
    }

    if (lastUsageMetadata) {
      return {
        inputTokens: lastUsageMetadata.promptTokenCount,
        outputTokens: lastUsageMetadata.candidatesTokenCount,
      };
    }
  }

  async chatStreamWithTools(options: ToolStreamOptions, callbacks: ToolStreamCallbacks): Promise<TokenUsage | undefined> {
    const { messages, resolved, systemPrompt, webSearchEnabled, signal, tools: toolSchemas, toolChoice, outputSchema } = options;
    const { onChunk, onToolCall, executeTools } = callbacks;
    const ai = getClient(resolved.apiKey);

    const config: Record<string, unknown> = {
      systemInstruction: systemPrompt,
    };

    // Structured output at session level — constrains text output only,
    // functionCall parts are unaffected by responseJsonSchema
    if (outputSchema) {
      config.responseMimeType = 'application/json';
      config.responseJsonSchema = outputSchema.schema;
    }

    // Compose tools config: built-in grounding (googleSearch) + app function declarations.
    // Both live in config.tools; the SDK sends them together. History is irrelevant here —
    // the SDK chat session owns history for this entire agentic turn.
    const configTools: any[] = [];
    if (toolChoice !== 'none') {
      if (webSearchEnabled) {
        configTools.push({ googleSearch: {} });
      }
      if (toolSchemas?.length) {
        configTools.push(...toProviderTools(toolSchemas, 'gemini'));
      }
    }
    if (configTools.length > 0) {
      config.tools = configTools;

      // Gemini: toolConfig.functionCallingConfig.mode = 'AUTO' | 'NONE' | 'ANY'
      const geminiModeMap: Record<string, string> = {
        auto: 'AUTO',
        required: 'ANY',
        none: 'NONE',
      };
      if (toolChoice && geminiModeMap[toolChoice]) {
        config.toolConfig = {
          functionCallingConfig: { mode: geminiModeMap[toolChoice] },
        };
      }
    }

    const priorMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];
    const lastParts = toGeminiLastMessage(lastMessage);

    // Drain one streaming response: forward text to onChunk, collect functionCall parts.
    // Tolerates stream teardown errors only when the model signaled completion.
    // Returns the last usageMetadata from the stream (final chunk has totals).
    const drainStream = async (
      stream: AsyncGenerator<any>,
      calls: Array<{ name: string; args: Record<string, unknown> }>
    ): Promise<any> => {
      let streamFinished = false;
      let lastUsageMetadata: any = null;
      try {
        for await (const chunk of stream) {
          if (signal?.aborted) break;
          const finishReason = chunk.candidates?.[0]?.finishReason;
          if (finishReason) streamFinished = true;

          if ((chunk as any).usageMetadata) {
            lastUsageMetadata = (chunk as any).usageMetadata;
          }

          const parts = chunk.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.text) {
                onChunk(part.text);
              } else if ((part as any).functionCall) {
                calls.push({
                  name: (part as any).functionCall.name,
                  args: (part as any).functionCall.args || {},
                });
              }
            }
          } else if (chunk.text) {
            onChunk(chunk.text);
          }

          // Extract web citations from grounding metadata
          const chunkGroundingMeta = (chunk as any).candidates?.[0]?.groundingMetadata;
          const citations = chunkGroundingMeta ? extractGroundingCitations(chunkGroundingMeta) : null;
          if (citations) {
            onChunk('', citations);
          }
        }
      } catch (err: any) {
        if (streamFinished) {
          console.warn('[GeminiAdapter] Stream teardown error (response was complete):', err.message);
        } else {
          throw err;
        }
      }
      return lastUsageMetadata;
    };

    // One persistent SDK chat session for this entire agentic turn.
    // The SDK stores every model response (including thoughtSignatures) in its internal
    // history automatically, so we never touch history reconstruction ourselves.
    const chat = ai.chats.create({
      model: resolved.modelId,
      config,
      ...(priorMessages.length > 0 && { history: toGeminiHistory(priorMessages) }),
    });

    // messageToSend: user parts on pass 0, functionResponse parts on subsequent passes
    let messageToSend: any = lastParts;
    let isFirstPass = true;
    let totalOutputTokens = 0;
    let lastInputTokens: number | undefined;

    for (let pass = 0; pass < MAX_TOOL_PASSES; pass++) {
      if (signal?.aborted) break;

      const collectedCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

      try {
        const stream = await chat.sendMessageStream({ message: messageToSend });
        const usageMeta = await drainStream(stream, collectedCalls);
        if (usageMeta) {
          totalOutputTokens += usageMeta.candidatesTokenCount || 0;
          lastInputTokens = usageMeta.promptTokenCount;
        }
      } catch (err: any) {
        // Some Gemini models (preview/experimental) reject function calling entirely.
        // On the first pass only, rebuild without tools and stream a plain response.
        if (isFirstPass && configTools.length > 0 && isToolsUnsupportedError(err)) {
          console.warn(`[GeminiAdapter] ${resolved.modelId} does not support function calling — retrying without tools`);
          const fallbackConfig = { ...config };
          delete fallbackConfig.tools;
          const fallbackChat = ai.chats.create({
            model: resolved.modelId,
            config: fallbackConfig,
            ...(priorMessages.length > 0 && { history: toGeminiHistory(priorMessages) }),
          });
          await drainStream(await fallbackChat.sendMessageStream({ message: messageToSend }), []);
          return;
        }
        throw err;
      }

      isFirstPass = false;

      // No function calls — model gave a final text response, done
      if (collectedCalls.length === 0) break;

      const toolCalls = parseGeminiToolCalls(collectedCalls);

      if (!executeTools) {
        // No executor provided (adapter called outside orchestrator) — surface via onToolCall
        onToolCall({ toolCalls });
        break;
      }

      // Execute tools via the orchestrator callback (activity reporting happens there).
      // Then send results back through the SAME chat session.
      // The SDK has already stored the model's function call turn (with thoughtSignature)
      // in its history, so the next sendMessageStream gets the correct full context.
      const results = await executeTools(toolCalls);

      if (signal?.aborted) break;

      messageToSend = results.map((r, idx) => ({
        functionResponse: {
          name: toolCalls[idx]?.name || 'unknown',
          response: { result: r.content },
        },
      }));
    }

    if (totalOutputTokens > 0 || lastInputTokens != null) {
      return {
        inputTokens: lastInputTokens,
        outputTokens: totalOutputTokens || undefined,
      };
    }
  }

  async chat(options: ChatOptions): Promise<{ text: string }> {
    const { messages, resolved, systemPrompt, outputSchema } = options;
    const ai = getClient(resolved.apiKey);
    const isImageModel = isImageGenerationModel(resolved.modelId);

    const config: Record<string, unknown> = {};
    if (isImageModel) {
      config.responseModalities = [Modality.TEXT, Modality.IMAGE];
    } else {
      config.systemInstruction = systemPrompt;
      if (outputSchema) {
        config.responseMimeType = 'application/json';
        config.responseJsonSchema = outputSchema.schema;
      }
    }

    const priorMessages = messages.slice(0, -1);
    const lastMessage = messages[messages.length - 1];

    const chat = ai.chats.create({
      model: resolved.modelId,
      config,
      ...(priorMessages.length > 0 && {
        history: toGeminiHistory(priorMessages),
      }),
    });

    const lastParts = toGeminiLastMessage(lastMessage);
    const result = await chat.sendMessage({ message: lastParts });
    return { text: result.text || 'No response.' };
  }

  async processAudio(options: TranscriptionOptions): Promise<string> {
    const { audioBlob, resolved, prompt, outputSchema } = options;
    const ai = getClient(resolved.apiKey);
    const base64Data = await blobToBase64(audioBlob);

    const response = await ai.models.generateContent({
      model: resolved.modelId,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
      ...(outputSchema && {
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: outputSchema.schema,
        },
      }),
    });

    const text = response.text;
    if (!text) throw new Error('No response from AI.');
    return text;
  }

  async processDocument(options: DocumentOptions): Promise<string> {
    const { file, resolved, prompt, outputSchema } = options;
    const ai = getClient(resolved.apiKey);

    const schemaConfig = outputSchema
      ? { config: { responseMimeType: 'application/json' as const, responseJsonSchema: outputSchema.schema } }
      : {};

    // Handle VTT files
    if (file.name.endsWith('.vtt') || file.type === 'text/vtt') {
      const vttContent = await file.text();
      const parsed = parseVTT(vttContent);

      const response = await ai.models.generateContent({
        model: resolved.modelId,
        contents: {
          parts: [{ text: `Transcript:\n${parsed.fullText}\n\n${prompt}` }],
        },
        ...schemaConfig,
      });

      return response.text || '';
    }

    // Handle text/markdown
    if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md')) {
      const textContent = await file.text();

      const response = await ai.models.generateContent({
        model: resolved.modelId,
        contents: {
          parts: [{ text: textContent }, { text: prompt }],
        },
        ...schemaConfig,
      });

      return response.text || '';
    }

    // Handle binary files
    const base64Data = await blobToBase64(file);

    const response = await ai.models.generateContent({
      model: resolved.modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: prompt },
        ],
      },
      ...schemaConfig,
    });

    return response.text || '';
  }
}
