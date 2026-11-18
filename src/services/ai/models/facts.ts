/** What a model is, from ordered fact sources: the user, its own server, its provider's list, models.dev, name rules, then its provider's default; the first source to answer each fact wins. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { Modality } from '@config/modelSpine.config';
import { modalitiesService } from '@services/modalities';
import type { ModelInfo } from '@services/modalities';
import type { Model, ServedModelInfo } from '@shared/types/modelProviders';

/** One source's answer about a model; unset means that source doesn't say. */
interface ModelFacts {
  modalities?: { input: Modality[]; output: Modality[] };
  tools?: boolean;
  reasoning?: boolean;
  contextTokens?: number;
}

/** A model as the spine describes it; `known` is false when its modalities are only its provider's default. */
export interface ModelDescription {
  input: Modality[];
  output: Modality[];
  tools: boolean;
  reasoning: boolean;
  contextTokens: number | null;
  known: boolean;
}

type DescribedModel = Pick<Model, 'id' | 'toolsEnabled' | 'audioInput' | 'served' | 'listed'>;

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

function providerDefault(provider: string): ModelFacts['modalities'] {
  const { input, output } = MODEL_SPINE_CONFIG.providerModalities[provider] ?? MODEL_SPINE_CONFIG.assumedModalities;
  return { input: [...input], output: [...output] };
}

/** The user's Audio input tick adds or removes audio from what the sources say. */
function withAudioChoice(input: Modality[], audioInput: boolean | undefined): Modality[] {
  if (audioInput === undefined) return input;
  const rest = input.filter((m) => m !== 'audio');
  return audioInput ? [...rest, 'audio'] : rest;
}

/** The first answer a source gives for one fact. */
const firstOf = <K extends keyof ModelFacts>(layers: ModelFacts[], key: K): ModelFacts[K] =>
  layers.find((layer) => layer[key] !== undefined)?.[key];

/** A description as chips show it: modalities and abilities; null when only its provider's default describes it. */
export function infoOf(described: ModelDescription): ModelInfo | null {
  if (!described.known) return null;
  return {
    modalities: { input: described.input, output: described.output },
    capabilities: { toolCall: described.tools, reasoning: described.reasoning },
  };
}

/** A model's modalities, abilities and context window; tools and reasoning are false unless a source says so. */
export function describeModel(provider: string, model: DescribedModel): ModelDescription {
  const layers = [userFacts(model), reportedFacts(model.served), reportedFacts(model.listed), catalogFacts(provider, model), nameFacts(model)];
  const stated = firstOf(layers, 'modalities');
  const modalities = stated ?? providerDefault(provider);
  return {
    input: withAudioChoice(modalities.input, model.audioInput),
    output: modalities.output,
    tools: firstOf(layers, 'tools') ?? false,
    reasoning: firstOf(layers, 'reasoning') ?? false,
    contextTokens: firstOf(layers, 'contextTokens') ?? null,
    known: !!stated,
  };
}
