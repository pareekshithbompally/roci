/** The only place provider names map to AI SDK constructors. */

import { appleIntelligenceModel } from '@services/ai/apple/appleLanguageModel';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq, groq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { getPlatformFetch } from '@services/platform-fetch';
import { chatServer } from '@services/localModels.service';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { capabilitiesOf } from '@services/ai/capabilities';
import { llamaServerRequestBody } from '@services/ai/llamaServer';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { ReasoningEffort } from '@shared/types';
import type { EmbeddingModel, ImageModel, LanguageModel, LanguageModelCallOptions, streamText, ToolSet } from 'ai';

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

/**
 * AI SDK model for a resolved model; `webSearch` picks OpenAI's Responses API, and `llamaServer` (the chat's
 * thinking level) adds llama-server's own progress and thinking-budget fields.
 */
export function createModel(
  resolved: ResolvedModel,
  options?: { webSearch?: boolean; llamaServer?: { reasoningEffort: ReasoningEffort } },
): LanguageModel {
  const fetch = getPlatformFetch();

  switch (getProviderType(resolved.provider)) {
    case 'apple-intelligence':
      return appleIntelligenceModel();
    case 'on-device':
      return onDeviceChatModel(resolved.modelId, options?.llamaServer?.reasoningEffort);
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

/** A chat model on this device: each call asks Rust for its llama-server (started or woken as needed), then talks to it. */
function onDeviceChatModel(modelId: string, effort?: ReasoningEffort): LanguageModelV4 {
  const served = async () => {
    const server = await chatServer(modelId);
    return createOpenAICompatible({
      name: LOCAL_MODELS_CONFIG.provider.id,
      baseURL: `${server.url}/v1`,
      apiKey: server.apiKey,
      fetch: getPlatformFetch(),
      includeUsage: true,
      ...(effort && { transformRequestBody: llamaServerRequestBody(effort) }),
    }).chatModel(modelId);
  };
  return {
    specificationVersion: 'v4',
    provider: LOCAL_MODELS_CONFIG.provider.id,
    modelId,
    supportedUrls: {},
    doGenerate: async (options) => (await served()).doGenerate(options),
    doStream: async (options) => (await served()).doStream(options),
  };
}

/** The on-device embedding server (llama.cpp's `llama-server`, OpenAI embeddings API) at `baseUrl`. */
export function createLocalEmbeddingModel(baseUrl: string, apiKey: string, modelId: string): EmbeddingModel {
  return createOpenAICompatible({ name: 'llama-server', baseURL: `${baseUrl}/v1`, apiKey, fetch: getPlatformFetch() }).embeddingModel(modelId);
}

/** The on-device image server (stable-diffusion.cpp's `sd-server`, OpenAI image API) at `baseUrl`. */
export function createLocalImageModel(baseUrl: string, modelId: string): ImageModel {
  return createOpenAICompatible({ name: 'sd-server', baseURL: `${baseUrl}/v1`, fetch: getPlatformFetch() }).imageModel(modelId);
}

/** Gemini and OpenAI only return a thinking model's thoughts when asked; Anthropic and local servers always do. */
const SHOW_THINKING = {
  gemini: { google: { thinkingConfig: { includeThoughts: true } } },
  openai: { openai: { reasoningSummary: 'auto' } },
} as const;

/**
 * The chat's thinking level as AI SDK call settings: the SDK's own `reasoning` (each provider maps it to its
 * effort or budget), and for a thinking model, asking its provider to return the thoughts.
 */
export function reasoningCallSettings(
  resolved: ResolvedModel,
  effort: ReasoningEffort,
): Pick<LanguageModelCallOptions, 'reasoning'> & Pick<Parameters<typeof streamText>[0], 'providerOptions'> {
  const thinks = effort !== 'none' && capabilitiesOf(resolved.provider, resolved.model).reasoning;
  const type = getProviderType(resolved.provider);
  const showThinking = thinks && (type === 'gemini' || type === 'openai') ? SHOW_THINKING[type] : undefined;
  return { reasoning: effort, ...(showThinking && { providerOptions: showThinking }) };
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
