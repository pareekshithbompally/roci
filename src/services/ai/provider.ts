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
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { LanguageModel, ToolSet } from 'ai';

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

/** llama-server's request flag for streaming `prompt_progress` chunks. */
const withPromptProgress = (body: Record<string, unknown>) => ({ ...body, return_progress: true });

/** AI SDK model for a resolved model; `webSearch` picks OpenAI's Responses API, `promptProgress` asks llama-server. */
export function createModel(
  resolved: ResolvedModel,
  options?: { webSearch?: boolean; promptProgress?: boolean },
): LanguageModel {
  const fetch = getPlatformFetch();

  switch (getProviderType(resolved.provider)) {
    case 'apple-intelligence':
      return appleIntelligenceModel();
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
        ...(Object.keys(customHeaders).length > 0 && { headers: customHeaders }),
        ...(options?.promptProgress && { transformRequestBody: withPromptProgress }),
      });
      return provider.chatModel(resolved.modelId);
    }
  }
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
