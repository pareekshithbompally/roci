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
import { mlxEmbed } from '@services/mlx.service';
import { mlxLanguageModel } from '@services/ai/onDevice/mlxLanguageModel';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { capabilitiesOf } from '@services/ai/capabilities';
import { llamaServerRequestBody } from '@services/ai/llamaServer';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { ReasoningEffort } from '@shared/types';
import type { ImageModel, LanguageModel, LanguageModelCallOptions, streamText, ToolSet } from 'ai';

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

/** The embedding model on this device (MLX), as an AI SDK embedding model. */
export function createLocalEmbeddingModel(modelId: string): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: LOCAL_MODELS_CONFIG.provider.id,
    modelId,
    maxEmbeddingsPerCall: undefined,
    supportsParallelCalls: false,
    doEmbed: async ({ values }) => ({ embeddings: await mlxEmbed(modelId, values), warnings: [] }),
  };
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
