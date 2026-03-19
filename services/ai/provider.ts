/**
 * AI SDK Provider Factory
 *
 * Single function that maps a ResolvedModel to an AI SDK LanguageModel.
 * This is the only place that maps provider names to SDK constructors.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createMistral } from '@ai-sdk/mistral';
import { createXai, xai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { getPlatformFetch } from '../platform-fetch';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { LanguageModel, ToolSet } from 'ai';

/** Extract custom headers from provider config (for Azure, OpenRouter, etc.) */
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
 * Create an AI SDK LanguageModel for the given resolved model.
 * Provider instances are lightweight — no caching needed.
 */
export function createModel(resolved: ResolvedModel): LanguageModel {
  const fetch = getPlatformFetch();

  switch (getProviderType(resolved.provider)) {
    case 'anthropic': {
      const customHeaders = buildCustomHeaders(resolved.providerConfig);
      const provider = createAnthropic({
        apiKey: resolved.apiKey,
        fetch,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
          ...customHeaders,
        },
      });
      return provider(resolved.modelId);
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'gemini': {
      const provider = createGoogleGenerativeAI({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'mistral': {
      const provider = createMistral({ apiKey: resolved.apiKey, fetch });
      return provider(resolved.modelId);
    }
    case 'xai': {
      const provider = createXai({ apiKey: resolved.apiKey, fetch });
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
        ...(Object.keys(customHeaders).length > 0 && { headers: customHeaders }),
      });
      return provider.chatModel(resolved.modelId);
    }
  }
}

/**
 * Return provider-specific web search tools for the given model.
 * Each provider exposes web search as a native tool in the AI SDK.
 * Returns undefined for providers that don't support web search.
 */
export function getWebSearchTools(resolved: ResolvedModel): ToolSet | undefined {
  switch (getProviderType(resolved.provider)) {
    case 'anthropic':
      return { webSearch: anthropic.tools.webSearch_20250305({}) };
    case 'gemini':
      return { googleSearch: google.tools.googleSearch({}) };
    case 'openai':
      return { webSearch: openai.tools.webSearchPreview({}) };
    case 'xai':
      return { webSearch: xai.tools.webSearch({}) };
    default:
      return undefined;
  }
}
