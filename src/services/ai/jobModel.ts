/** The model a meeting job runs on, ready to call — or the setup problem in the way, in words that say what to change. One
 *  check for every caller: the pipeline throws it, the live notes pane shows it. */

import { requiresApiKey, resolveSummaryModel, type ResolvedModel } from '@shared/utils/modelResolver';
import { getProviderTitle } from '@shared/utils/provider.utils';
import type { AppSettings } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { AiError } from './errors';

export type ModelCheck = { model: ResolvedModel; problem?: undefined } | { model?: undefined; problem: AiError };

/** The Summary model (summaries and live notes). */
export function summaryModel(settings: AppSettings, providers: ModelProvider[]): ModelCheck {
  const model = resolveSummaryModel(settings, providers);
  if (!model) {
    const id = settings.analyzeModel || settings.chatModel;
    const which = id ? `Summary model "${id}" isn't available.` : 'No Summary model is chosen.';
    return { problem: new AiError('setup', `${which} Choose one in Settings › Default Models.`) };
  }
  if (requiresApiKey(model) && !model.apiKey) {
    return { problem: new AiError('setup', `Add your ${getProviderTitle(model.provider)} API key in Settings › Providers.`) };
  }
  return { model };
}

export function requireSummaryModel(settings: AppSettings, providers: ModelProvider[]): ResolvedModel {
  const check = summaryModel(settings, providers);
  if (check.problem) throw check.problem;
  return check.model;
}
