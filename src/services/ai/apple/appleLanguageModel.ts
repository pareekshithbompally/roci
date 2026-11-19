/** Apple Intelligence as an AI SDK model (text only): generate is one guided call, stream is the native token stream. */

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { textOf } from '@services/ai/promptText';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { appleIntelligence } from './appleIntelligence.service';
import type { AppleChatRequest } from './appleIntelligence.service';
import { appleFailureError, TEXT_ONLY_ERROR } from './contextWindow';

/** Apple's session doesn't report token counts. */
const NO_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

const TEXT_ID = '0';

/** The prompt as Apple's session takes it: instructions (system) + the conversation's text turns. */
function toChat(prompt: LanguageModelV4Prompt): AppleChatRequest {
  const instructions = prompt.filter((m) => m.role === 'system').map(textOf).join('\n\n');
  const turns = prompt.flatMap((m) => (m.role === 'user' || m.role === 'assistant' ? [{ role: m.role, text: textOf(m) }] : []))
    .filter((turn) => turn.text.length > 0);
  return { instructions, turns };
}

async function generate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
  const { instructions, turns } = toChat(options.prompt);
  const schema = options.responseFormat?.type === 'json' ? options.responseFormat.schema : undefined;
  const text = turns.map((turn) => turn.text).join('\n\n');
  const output = await appleIntelligence.generate(instructions, text, schema).catch((error: unknown) => {
    throw appleFailureError(error, 'model');
  });
  return {
    content: [{ type: 'text', text: output }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: NO_USAGE,
    warnings: [],
  };
}

/** Pieces arrive as FoundationModels writes them; Stop (the abort signal) or cancelling the stream ends generation on the device. */
async function stream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
  const request = toChat(options.prompt);
  if (request.turns.at(-1)?.role !== 'user') throw new Error(TEXT_ONLY_ERROR);
  const cancelled = new AbortController();
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, cancelled.signal]) : cancelled.signal;
  return {
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: TEXT_ID });
        appleIntelligence
          .stream(request, (delta) => controller.enqueue({ type: 'text-delta', id: TEXT_ID, delta }), signal)
          .then(() => {
            controller.enqueue({ type: 'text-end', id: TEXT_ID });
            controller.enqueue({ type: 'finish', usage: NO_USAGE, finishReason: { unified: 'stop', raw: undefined } });
            controller.close();
          })
          .catch((error: unknown) => controller.error(appleFailureError(error, 'model')));
      },
      cancel() {
        cancelled.abort();
      },
    }),
  };
}

export function appleIntelligenceModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: APPLE_INTELLIGENCE.provider,
    modelId: APPLE_INTELLIGENCE.model,
    supportedUrls: {},
    doGenerate: generate,
    doStream: stream,
  };
}
