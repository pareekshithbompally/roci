/**
 * Apple Intelligence as an AI SDK language model (spec v4), so it is created by
 * `createModel()` like every other provider (I4) and callers such as
 * `analyzeTranscript` stay generic. System messages become the session
 * instructions; a JSON response format is passed through as the guided-
 * generation schema (DynamicGenerationSchema in the Swift bridge).
 *
 * Text in, text out: summaries and titles. No tools, no images — Apple
 * Intelligence is offered only where those aren't needed (never in chat).
 */

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { APPLE_INTELLIGENCE } from '@config/providers.config';
import { appleIntelligence } from './appleIntelligence.service';

/** Apple's session doesn't report token counts. */
const NO_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

/** The prompt as Apple's session takes it: instructions (system) + one prompt (user text). */
function split(prompt: LanguageModelV4Prompt): { instructions: string; text: string } {
  const instructions = prompt.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const text = prompt
    .flatMap((m) => (m.role === 'user' || m.role === 'assistant' ? m.content : []))
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n\n');
  return { instructions, text };
}

async function generate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
  const { instructions, text } = split(options.prompt);
  const schema = options.responseFormat?.type === 'json' ? options.responseFormat.schema : undefined;
  const output = await appleIntelligence.generate(instructions, text, schema);
  return {
    content: [{ type: 'text', text: output }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: NO_USAGE,
    warnings: [],
  };
}

/** Guided generation returns whole, so the stream carries it as one text part. */
async function stream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
  const result = await generate(options);
  const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: '0' });
        controller.enqueue({ type: 'text-delta', id: '0', delta: text });
        controller.enqueue({ type: 'text-end', id: '0' });
        controller.enqueue({ type: 'finish', usage: result.usage, finishReason: result.finishReason });
        controller.close();
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
