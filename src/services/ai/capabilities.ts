/** The one answer to what a model can do: user override → models.dev (cached) → provider default. */

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
