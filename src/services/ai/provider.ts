/** The only place provider names map to AI SDK constructors. */

import { appleIntelligenceModel } from '@services/ai/apple/appleLanguageModel';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq, groq } from '@ai-sdk/groq';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { SdkSpeechFamily } from '@config/transcription.config';
import { getPlatformFetch } from '@services/platform-fetch';
import { mlxLanguageModel } from '@services/ai/onDevice/mlxLanguageModel';
import { profileOf } from '@services/ai/models';
import { llamaServerRequestBody } from '@services/ai/llamaServer';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { ReasoningEffort } from '@shared/types';
import type { ProviderType } from '@services/ai/types';
import { wrapLanguageModel } from 'ai';
import type { ImageModel, LanguageModel, LanguageModelCallOptions, SpeechModel, streamText, ToolSet, TranscriptionModel } from 'ai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { serverAppOf } from '@shared/utils/provider.utils';
import { schemaInPromptMiddleware } from '@services/ai/schemaInPrompt';

/** Extract custom headers from provider config (for OpenRouter, etc.) */
function buildCustomHeaders(providerConfig: ResolvedModel['providerConfig']): Record<string, string> {
  const headers: Record<string, string> = {};
  if (providerConfig.custom_header) {
    for (const header of providerConfig.custom_header) {
      headers[header.header] = header.value;
    }
  }
  return headers;
}

type ModelOptions = { webSearch?: boolean; llamaServer?: { reasoningEffort: ReasoningEffort } };

/**
 * AI SDK model for a resolved model; `webSearch` picks OpenAI's Responses API, and `llamaServer` (the chat's
 * thinking level) adds llama-server's own progress and thinking-budget fields. A provider that ignores a JSON schema
 * (`ServerApp.ignoresSchema`) gets it in the instructions as well.
 */
export function createModel(resolved: ResolvedModel, options?: ModelOptions): LanguageModel {
  const model = providerModel(resolved, options);
  return serverAppOf(resolved.provider)?.ignoresSchema ? wrapLanguageModel({ model, middleware: schemaInPromptMiddleware }) : model;
}

/** The provider's own AI SDK model. */
function providerModel(resolved: ResolvedModel, options?: ModelOptions): LanguageModelV4 {
  const fetch = getPlatformFetch();

  switch (getProviderType(resolved.provider)) {
    case 'apple-intelligence':
      return appleIntelligenceModel();
    case 'on-device':
      return mlxLanguageModel(resolved.modelId);
    case 'anthropic': {
      const customHeaders = buildCustomHeaders(resolved.providerConfig);
      const provider = createAnthropic({
        apiKey: resolved.apiKey,
        fetch,
        headers: customHeaders,
      });
      return provider(resolved.modelId);
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey: resolved.apiKey, fetch });
      if (options?.webSearch) {
        return provider.responses(resolved.modelId);
      }
      return provider(resolved.modelId);
    }
    case 'gemini': {
      const provider = createGoogle({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'mistral': {
      const provider = createMistral({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'groq': {
      const provider = createGroq({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'openai-compat': {
      const customHeaders = buildCustomHeaders(resolved.providerConfig);
      const provider = createOpenAICompatible({
        name: resolved.provider,
        apiKey: resolved.apiKey,
        baseURL: resolved.baseUrl,
        fetch,
        // Streamed replies report their tokens only when asked: the context gauge and usage need them.
        includeUsage: true,
        // Local servers (Ollama, LM Studio, llama-server, vLLM, Jan) and OpenRouter take a JSON schema and decode to it.
        supportsStructuredOutputs: true,
        ...(Object.keys(customHeaders).length > 0 && { headers: customHeaders }),
        ...(options?.llamaServer && { transformRequestBody: llamaServerRequestBody(options.llamaServer.reasoningEffort) }),
      });
      return provider.chatModel(resolved.modelId);
    }
  }
}

/** AI SDK image model for a resolved image model; throws for providers without image models. */
export function createImageModel(resolved: ResolvedModel): ImageModel {
  const fetch = getPlatformFetch();
  switch (getProviderType(resolved.provider)) {
    case 'openai':
      return createOpenAI({ apiKey: resolved.apiKey, fetch }).image(resolved.modelId);
    case 'gemini':
      return createGoogle({ apiKey: resolved.apiKey, fetch }).image(resolved.modelId);
    default:
      throw new Error(`${resolved.provider} has no image models.`);
  }
}

/** A cloud voice model (text in, audio out) for Read aloud; only providers whose AI SDK speaks. */
export function createSpeechModel(resolved: ResolvedModel): SpeechModel {
  const fetch = getPlatformFetch();
  switch (getProviderType(resolved.provider)) {
    case 'openai':
      return createOpenAI({ apiKey: resolved.apiKey, fetch }).speech(resolved.modelId);
    case 'gemini':
      return createGoogle({ apiKey: resolved.apiKey, fetch }).speech(resolved.modelId);
    default:
      throw new Error(`${resolved.provider} has no voice models.`);
  }
}

/** Each AI SDK speech family's package, building its transcription model (one line per family). */
const TRANSCRIPTION_PACKAGES: Record<SdkSpeechFamily, (resolved: ResolvedModel, fetch: typeof globalThis.fetch) => TranscriptionModel> = {
  'openai-compatible': (r, fetch) => createOpenAI({ apiKey: r.apiKey, baseURL: r.baseUrl || undefined, fetch }).transcription(r.modelId),
  deepgram: (r, fetch) => createDeepgram({ apiKey: r.apiKey, fetch }).transcription(r.modelId),
  elevenlabs: (r, fetch) => createElevenLabs({ apiKey: r.apiKey, fetch }).transcription(r.modelId),
};

/** A cloud speech-to-text model (audio in, text out), built here like every other model. */
export function createTranscriptionModel(family: SdkSpeechFamily, resolved: ResolvedModel): TranscriptionModel {
  return TRANSCRIPTION_PACKAGES[family](resolved, getPlatformFetch());
}

/** Gemini and OpenAI only return a thinking model's thoughts when asked; Anthropic and local servers always do. */
const SHOW_THINKING = {
  gemini: { google: { thinkingConfig: { includeThoughts: true } } },
  openai: { openai: { reasoningSummary: 'auto' } },
} as const;

/** Anthropic caches only when asked (OpenAI and Gemini cache by themselves): one marker caches the whole conversation,
 *  so the next turn and each tool step reuse it. */
const CACHE_CONVERSATION = { anthropic: { cacheControl: { type: 'ephemeral' } } } as const;

/** What a chat call asks of its provider beyond the SDK's own settings: Anthropic's caching, or a thinking model's thoughts. */
function chatProviderOptions(type: ProviderType, thinks: boolean) {
  if (type === 'anthropic') return CACHE_CONVERSATION;
  return thinks && (type === 'gemini' || type === 'openai') ? SHOW_THINKING[type] : undefined;
}

/**
 * A chat call's settings: the thinking level as the SDK's own `reasoning` (each provider maps it to its effort or budget),
 * plus what its provider must be asked for (see `chatProviderOptions`).
 */
export function chatCallSettings(
  resolved: ResolvedModel,
  effort: ReasoningEffort,
): Pick<LanguageModelCallOptions, 'reasoning'> & Pick<Parameters<typeof streamText>[0], 'providerOptions'> {
  const thinks = effort !== 'none' && profileOf(resolved.provider, resolved.model).reasoning;
  const providerOptions = chatProviderOptions(getProviderType(resolved.provider), thinks);
  return { reasoning: effort, ...(providerOptions && { providerOptions }) };
}

/** The provider's native web search tools; undefined when it has none. */
export function getWebSearchTools(resolved: ResolvedModel): ToolSet | undefined {
  switch (getProviderType(resolved.provider)) {
    case 'anthropic':
      return { webSearch: anthropic.tools.webSearch_20250305({}) };
    case 'gemini':
      return { googleSearch: google.tools.googleSearch({}) };
    case 'openai':
      return { webSearch: openai.tools.webSearchPreview({}) };
    case 'groq':
      return { browserSearch: groq.tools.browserSearch({}) };
    default:
      return undefined;
  }
}
