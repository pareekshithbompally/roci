/** A model's profile: each fact taken from the first source that states it (the user, its provider's list, models.dev,
 *  a name rule, then its provider's default), with where it came from. Every screen and request reads this one answer. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { Modality } from '@config/modelSpine.config';
import { modalitiesService } from '@services/modalities';
import type { Model, ModelOverrides, ModelReport } from '@shared/types/modelProviders';

/** One fact a profile settles. */
export type Fact = keyof ModelReport;

/** Where a fact came from; `similar-name`, `name-rule` and `default` are guesses. */
export type FactSource = 'user' | 'provider' | 'catalog' | 'similar-name' | 'name-rule' | 'default';

const GUESSES: ReadonlySet<FactSource> = new Set(['similar-name', 'name-rule', 'default']);

/** The profile when a source describes the model; null when only its provider's default does (nothing worth showing). */
export const shownProfile = (profile: ModelProfile): ModelProfile | null => (profile.known ? profile : null);

/** The fact came from a guess, not from the user, the provider or the catalog. */
export const isGuess = (source: FactSource): boolean => GUESSES.has(source);

export interface ModelProfile {
  input: Modality[];
  output: Modality[];
  tools: boolean;
  reasoning: boolean;
  /** Context window in tokens; null when no source states it (the gauge hides). */
  contextTokens: number | null;
  /** Something other than its provider's default states its modalities. */
  known: boolean;
  sourceOf: Record<Fact, FactSource>;
}

type ProfiledModel = Pick<Model, 'id' | 'reported' | 'overrides'>;

interface Layer {
  source: FactSource;
  report: ModelReport;
}

/** The model's own catalog entry; one matched only by a similar name gives its inputs and outputs (chips, job fit),
 *  never the tools, thinking or context window a request is shaped by. */
function catalogLayer(provider: string, model: ProfiledModel): Layer | null {
  const match = modalitiesService.catalogReport(provider, model.id);
  if (!match) return null;
  if (match.exact) return { source: 'catalog', report: match.report };
  return { source: 'similar-name', report: { input: match.report.input, output: match.report.output } };
}

function nameRuleLayer(model: ProfiledModel): Layer | null {
  const rule = MODEL_SPINE_CONFIG.nameRules.find((r) => r.pattern.test(model.id));
  return rule ? { source: 'name-rule', report: { input: [...rule.input], output: [...rule.output] } } : null;
}

/** Speech providers serve speech, any other serves language models; tools and thinking only when a source says so. */
function defaultLayer(provider: string): Layer {
  const { input, output } = MODEL_SPINE_CONFIG.providerModalities[provider] ?? MODEL_SPINE_CONFIG.assumedModalities;
  return { source: 'default', report: { input: [...input], output: [...output], tools: false, reasoning: false } };
}

/** The inputs a correction turns on or off. */
const INPUT_OVERRIDES: ReadonlyArray<{ key: 'vision' | 'audio'; modality: Modality }> = [
  { key: 'vision', modality: 'image' },
  { key: 'audio', modality: 'audio' },
];

/** The sources' inputs with the user's input corrections applied; unchanged when there are none. */
function correctedInput(input: Modality[], overrides: ModelOverrides): Modality[] {
  return INPUT_OVERRIDES.reduce((list, { key, modality }) => {
    const on = overrides[key];
    if (on === undefined) return list;
    const rest = list.filter((m) => m !== modality);
    return on ? [...rest, modality] : rest;
  }, input);
}

const hasInputOverride = (overrides: ModelOverrides) => INPUT_OVERRIDES.some(({ key }) => overrides[key] !== undefined);

/** Its own catalog entry outranks a name rule; a name rule (about this very model) outranks another host's entry for a model
 *  with a similar name — `gpt-4o-mini-transcribe` is audio in, whatever a gateway's lookalike says. */
function layersOf(provider: string, model: ProfiledModel): Layer[] {
  const { tools, reasoning } = model.overrides ?? {};
  const catalog = catalogLayer(provider, model);
  const layers = [
    { source: 'user' as const, report: { tools, reasoning } },
    model.reported && { source: 'provider' as const, report: model.reported },
    catalog?.source === 'catalog' && catalog,
    nameRuleLayer(model),
    catalog?.source === 'similar-name' && catalog,
    defaultLayer(provider),
  ];
  return layers.filter((layer): layer is Layer => !!layer);
}

/** The first layer that states the fact; the default layer states every fact but the context window. */
function settle<K extends Fact>(layers: Layer[], fact: K): { value: ModelReport[K]; source: FactSource } {
  const layer = layers.find((l) => l.report[fact] !== undefined);
  return { value: layer?.report[fact], source: layer?.source ?? 'default' };
}

export function profileOf(provider: string, model: ProfiledModel): ModelProfile {
  const layers = layersOf(provider, model);
  const overrides = model.overrides ?? {};
  const sourced = settle(layers, 'input');
  const input = hasInputOverride(overrides)
    ? { value: correctedInput(sourced.value ?? [], overrides), source: 'user' as const }
    : sourced;
  const output = settle(layers, 'output');
  const tools = settle(layers, 'tools');
  const reasoning = settle(layers, 'reasoning');
  const contextTokens = settle(layers, 'contextTokens');
  return {
    input: input.value ?? [],
    output: output.value ?? [],
    tools: tools.value ?? false,
    reasoning: reasoning.value ?? false,
    contextTokens: contextTokens.value ?? null,
    known: input.source !== 'default' || output.source !== 'default',
    sourceOf: { input: input.source, output: output.source, tools: tools.source, reasoning: reasoning.source, contextTokens: contextTokens.source },
  };
}

/** What a model can do beyond text in and out, as every model list shows it (chips, menu lines). */
export type ModelFeature = 'vision' | 'audio' | 'video' | 'tools' | 'thinking';

const FEATURES: ReadonlyArray<{ feature: ModelFeature; fact: Fact; has: (p: ModelProfile) => boolean }> = [
  { feature: 'vision', fact: 'input', has: (p) => p.input.includes('image') },
  { feature: 'audio', fact: 'input', has: (p) => p.input.includes('audio') },
  { feature: 'video', fact: 'input', has: (p) => p.input.includes('video') },
  { feature: 'tools', fact: 'tools', has: (p) => p.tools },
  { feature: 'thinking', fact: 'reasoning', has: (p) => p.reasoning },
];

/** The profile's features in display order, each marked when it rests on a guess. */
export function featuresOf(profile: ModelProfile): Array<{ feature: ModelFeature; guessed: boolean }> {
  return FEATURES.filter((f) => f.has(profile)).map((f) => ({ feature: f.feature, guessed: isGuess(profile.sourceOf[f.fact]) }));
}
