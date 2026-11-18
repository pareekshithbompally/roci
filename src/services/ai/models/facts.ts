/** What a model is, from ordered fact sources: the user, its own server, its provider's list, models.dev, then name rules; the first source to answer each fact wins. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { Modality } from '@config/modelSpine.config';
import { modalitiesService } from '@services/modalities';
import type { Model, ServedModelInfo } from '@shared/types/modelProviders';

/** One source's answer about a model; unset means that source doesn't say. */
interface ModelFacts {
  modalities?: { input: Modality[]; output: Modality[] };
  tools?: boolean;
  reasoning?: boolean;
  contextTokens?: number;
}

/** A model as the spine describes it; `known` is false when no source gave its modalities. */
export interface ModelDescription {
  input: Modality[];
  output: Modality[];
  tools: boolean;
  reasoning: boolean;
  contextTokens: number | null;
  known: boolean;
}

type DescribedModel = Pick<Model, 'id' | 'toolsEnabled' | 'served' | 'listed'>;

const isModality = (m: string): m is Modality => (MODEL_SPINE_CONFIG.modalities as readonly string[]).includes(m);

function toModalities(raw: { input: string[]; output: string[] } | null | undefined): ModelFacts['modalities'] {
  if (!raw) return undefined;
  return { input: raw.input.filter(isModality), output: raw.output.filter(isModality) };
}

const userFacts = (model: DescribedModel): ModelFacts => ({ tools: model.toolsEnabled });

/** What a source reported: the model's own server, or its provider's model list. */
function reportedFacts(info: ServedModelInfo | undefined): ModelFacts {
  if (!info) return {};
  return { modalities: toModalities(info.modalities), tools: info.tools, reasoning: info.thinking, contextTokens: info.contextTokens };
}

function catalogFacts(provider: string, model: DescribedModel): ModelFacts {
  const info = modalitiesService.getModelInfo(provider, model.id);
  const contextTokens = modalitiesService.getModelContextLimit(provider, model.id) ?? undefined;
  if (!info) return { contextTokens };
  const { toolCall, reasoning } = info.capabilities;
  return { modalities: toModalities(info.modalities), tools: toolCall, reasoning, contextTokens };
}

function nameFacts(model: DescribedModel): ModelFacts {
  const rule = MODEL_SPINE_CONFIG.nameRules.find((r) => r.pattern.test(model.id));
  return rule ? { modalities: { input: [...rule.input], output: [...rule.output] } } : {};
}

/** The first answer a source gives for one fact. */
const firstOf = <K extends keyof ModelFacts>(layers: ModelFacts[], key: K): ModelFacts[K] =>
  layers.find((layer) => layer[key] !== undefined)?.[key];

/** A model's modalities, abilities and context window; tools and reasoning are false unless a source says so. */
export function describeModel(provider: string, model: DescribedModel): ModelDescription {
  const layers = [userFacts(model), reportedFacts(model.served), reportedFacts(model.listed), catalogFacts(provider, model), nameFacts(model)];
  const modalities = firstOf(layers, 'modalities');
  return {
    input: modalities?.input ?? [],
    output: modalities?.output ?? [],
    tools: firstOf(layers, 'tools') ?? false,
    reasoning: firstOf(layers, 'reasoning') ?? false,
    contextTokens: firstOf(layers, 'contextTokens') ?? null,
    known: !!modalities,
  };
}
