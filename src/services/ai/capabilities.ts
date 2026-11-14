/**
 * Model Capabilities — the one answer to "what can this model do?"
 *
 * Every consumer (chat tools, web search, the speech picker, summary
 * budgeting, Settings badges) reads capabilities here. Precedence per field:
 * the user's per-model override → models.dev → a provider-level default.
 *
 * Sync by design: it reads the models.dev cache the model-catalog query
 * loads (`useModelCatalog`). Before that cache loads, models.dev-derived
 * fields fall back to their defaults.
 */

import { MANAGED_SDK_PROVIDERS, WEB_SEARCH_PROVIDERS } from '@config/providers.config';
import { modalitiesService } from '@services/modalities';
import type { Model } from '@shared/types/modelProviders';

export interface ModelCapabilities {
  /** Function/tool calling (meeting tools, MCP). */
  tools: boolean;
  /** Provider-native web search tool. */
  webSearch: boolean;
  /** Accepts audio in a prompt, so it can transcribe through the multimodal adapter. */
  audioInput: boolean;
  /** Context window in tokens; null when unknown. */
  contextTokens: number | null;
}

export function capabilitiesOf(provider: string, model: Pick<Model, 'id' | 'toolsEnabled' | 'audioInput'>): ModelCapabilities {
  const info = modalitiesService.getModelInfo(provider, model.id);
  return {
    tools: model.toolsEnabled ?? info?.capabilities.toolCall ?? MANAGED_SDK_PROVIDERS.has(provider),
    webSearch: WEB_SEARCH_PROVIDERS.has(provider),
    audioInput: model.audioInput ?? info?.modalities?.input.includes('audio') ?? false,
    contextTokens: modalitiesService.getModelContextLimit(provider, model.id),
  };
}
