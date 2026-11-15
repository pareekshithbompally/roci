/** The one answer to what a model can do: user override → what its server reports → models.dev (cached) → provider default. */

import { MANAGED_SDK_PROVIDERS, WEB_SEARCH_PROVIDERS } from '@config/providers.config';
import { modalitiesService } from '@services/modalities';
import type { ModelInfo } from '@services/modalities';
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
  /** Takes a thinking level: its server says so (llama-server), or models.dev lists it as a reasoning model. */
  reasoning: boolean;
}

/** The model a capability is asked about: its id, the user's overrides, and what its server reports. */
type CapabilityModel = Pick<Model, 'id' | 'toolsEnabled' | 'audioInput' | 'served'>;

/** A model's modalities and capabilities: what its own server reports (local), else models.dev; null when neither knows. */
export function modelInfoOf(provider: string, model: Pick<Model, 'id' | 'served'>): ModelInfo | null {
  const served = model.served?.modalities;
  if (served) return { modalities: served, capabilities: {} };
  return modalitiesService.getModelInfo(provider, model.id);
}

export function capabilitiesOf(provider: string, model: CapabilityModel): ModelCapabilities {
  const info = modelInfoOf(provider, model);
  return {
    tools: model.toolsEnabled ?? info?.capabilities.toolCall ?? MANAGED_SDK_PROVIDERS.has(provider),
    webSearch: WEB_SEARCH_PROVIDERS.has(provider),
    audioInput: model.audioInput ?? info?.modalities?.input.includes('audio') ?? false,
    contextTokens: model.served?.contextTokens ?? modalitiesService.getModelContextLimit(provider, model.id),
    reasoning: model.served?.thinking ?? info?.capabilities.reasoning ?? false,
  };
}
