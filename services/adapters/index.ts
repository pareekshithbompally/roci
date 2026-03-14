/**
 * Adapter Factory & Re-exports
 */

import type { ProviderType, ILLMAdapter } from './types';
import { GeminiAdapter } from './gemini.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { OpenAICompatAdapter } from './openai-compat.adapter';

export type {
  ILLMAdapter,
  ProviderType,
  ChatStreamOptions,
  StreamCallbacks,
  ChatOptions,
  StreamMetadata,
  ToolStreamOptions,
  ToolStreamCallbacks,
  ToolCallEvent,
  ToolMessage,
} from './types';
export { clearClientCache } from './client-cache';

const adapters: Record<ProviderType, ILLMAdapter> = {
  gemini: new GeminiAdapter(),
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter(),
  'openai-compat': new OpenAICompatAdapter(),
};

/** Get the adapter for a given provider type */
export function getAdapter(providerType: ProviderType): ILLMAdapter {
  const adapter = adapters[providerType];
  if (!adapter) {
    throw new Error(`No adapter found for provider type: ${providerType}`);
  }
  return adapter;
}
