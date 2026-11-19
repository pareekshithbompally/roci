/** A chat model on this device as an AI SDK model: the prompt (with tool calls and results) goes to MLX, pieces stream back. */

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { convertToBase64, getTopLevelMediaType } from '@ai-sdk/provider-utils';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { textOf, toolResultText } from '@services/ai/promptText';
import { mlxCancel, mlxChat, type MlxChatRequest, type MlxChatResult, type MlxMessage } from '@services/mlx.service';

const TEXT_ID = '0';

type Message = LanguageModelV4Prompt[number];

/** A user turn's attached images as base64 (inline data only: an on-device model can't fetch a URL or a reference). */
function imagesOf(message: Message): string[] {
  if (message.role !== 'user') return [];
  return message.content.flatMap((part) => {
    if (part.type !== 'file' || getTopLevelMediaType(part.mediaType) !== 'image') return [];
    const { data } = part;
    if (data.type === 'data') return [convertToBase64(data.data)];
    if (data.type === 'url' && data.url.protocol === 'data:') return [data.url.href.slice(data.url.href.indexOf(',') + 1)];
    return [];
  });
}

/** One AI SDK message as MLX turns (a tool message carries one turn per result). */
function toTurns(message: Message): MlxMessage[] {
  switch (message.role) {
    case 'system':
      return [{ role: 'system', content: textOf(message) }];
    case 'user': {
      const images = imagesOf(message);
      return [{ role: 'user', content: textOf(message), ...(images.length > 0 && { images }) }];
    }
    case 'assistant': {
      const toolCalls = message.content.flatMap((part) =>
        part.type === 'tool-call' ? [{ id: part.toolCallId, function: { name: part.toolName, arguments: part.input } }] : []);
      return [{ role: 'assistant', content: textOf(message), ...(toolCalls.length > 0 && { toolCalls }) }];
    }
    case 'tool':
      return message.content.flatMap((part) =>
        part.type === 'tool-result' ? [{ role: 'tool' as const, content: toolResultText(part.output), toolCallId: part.toolCallId, toolName: part.toolName }] : []);
  }
}

function toRequest(options: LanguageModelV4CallOptions): MlxChatRequest {
  const tools = options.tools?.flatMap((tool) =>
    tool.type === 'function' ? [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }] : []);
  return {
    streamId: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    messages: options.prompt.flatMap(toTurns),
    ...(tools && tools.length > 0 && { tools }),
    maxTokens: options.maxOutputTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
  };
}

function usageOf(result: MlxChatResult): LanguageModelV4Usage {
  return {
    inputTokens: { total: result.promptTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: result.completionTokens, text: undefined, reasoning: undefined },
  };
}

/** Streams a reply; Stop (the abort signal) or cancelling the stream ends generation on the device. */
function stream(modelId: string, options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
  const request = toRequest(options);
  let textOpen = false;
  let calledTools = false;
  const stop = () => void mlxCancel(request.streamId);
  return Promise.resolve({
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        options.abortSignal?.addEventListener('abort', stop, { once: true });
        mlxChat(modelId, request, (event) => {
          if (event.type === 'text') {
            if (!textOpen) controller.enqueue({ type: 'text-start', id: TEXT_ID });
            textOpen = true;
            controller.enqueue({ type: 'text-delta', id: TEXT_ID, delta: event.text });
            return;
          }
          calledTools = true;
          controller.enqueue({ type: 'tool-call', toolCallId: event.id, toolName: event.name, input: event.arguments });
        })
          .then((result) => {
            if (textOpen) controller.enqueue({ type: 'text-end', id: TEXT_ID });
            const unified = calledTools ? 'tool-calls' : 'stop';
            controller.enqueue({ type: 'finish', usage: usageOf(result), finishReason: { unified, raw: undefined } });
            controller.close();
          })
          .catch((error: unknown) => controller.error(error instanceof Error ? error : new Error(String((error as { detail?: string })?.detail ?? error))))
          .finally(() => options.abortSignal?.removeEventListener('abort', stop));
      },
      cancel: stop,
    }),
  });
}

/** The whole reply at once, collected from the stream. */
async function generate(modelId: string, options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
  const reader = (await stream(modelId, options)).stream.getReader();
  const content: LanguageModelV4Content[] = [];
  let text = '';
  let finish: Extract<LanguageModelV4StreamPart, { type: 'finish' }> | undefined;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    const value = part.value;
    if (value.type === 'text-delta') text += value.delta;
    if (value.type === 'tool-call') content.push(value);
    if (value.type === 'finish') finish = value;
  }
  if (text) content.unshift({ type: 'text', text });
  return {
    content,
    finishReason: finish?.finishReason ?? { unified: 'stop', raw: undefined },
    usage: finish?.usage ?? usageOf({ promptTokens: 0, completionTokens: 0, cancelled: false }),
    warnings: [],
  };
}

export function mlxLanguageModel(modelId: string): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: LOCAL_MODELS_CONFIG.provider.id,
    modelId,
    supportedUrls: {},
    doGenerate: (options) => generate(modelId, options),
    doStream: (options) => stream(modelId, options),
  };
}
