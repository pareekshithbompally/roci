/** What a model can do, read from the model spine (`describeModel`): the one answer every caller shares. */

import { WEB_SEARCH_PROVIDERS } from '@config/providers.config';
import { describeModel, infoOf } from '@services/ai/models';
import type { ModelInfo } from '@services/modalities';
import type { Model } from '@shared/types/modelProviders';

export interface ModelCapabilities {
  /** Function/tool calling (meeting tools, MCP); only when a source says so or the user turns it on. */
  tools: boolean;
  /** Provider-native web search tool. */
  webSearch: boolean;
  /** Accepts audio in a prompt, so it can transcribe through the multimodal adapter. */
  audioInput: boolean;
  /** Context window in tokens; null when unknown. */
  contextTokens: number | null;
  /** Takes a thinking level. */
  reasoning: boolean;
}

type CapabilityModel = Pick<Model, 'id' | 'toolsEnabled' | 'audioInput' | 'served' | 'listed'>;

/** A model's modalities and abilities for its chips; null when no source describes it (its provider's default isn't shown). */
export const modelInfoOf = (provider: string, model: CapabilityModel): ModelInfo | null => infoOf(describeModel(provider, model));

export function capabilitiesOf(provider: string, model: CapabilityModel): ModelCapabilities {
  const described = describeModel(provider, model);
  return {
    tools: described.tools,
    webSearch: WEB_SEARCH_PROVIDERS.has(provider),
    audioInput: described.input.includes('audio'),
    contextTokens: described.contextTokens,
    reasoning: described.reasoning,
  };
}
