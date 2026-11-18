/** The model registry: one record per model across every source, and which records fit a job. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { ModelJob, SuggestedModel } from '@config/modelSpine.config';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { readinessOf } from '@shared/utils/modelResolver';
import type { ModelChoice } from '@shared/utils/modelResolver';
import { getModelDisplayName, isLocalProviderId } from '@shared/utils/provider.utils';
import type { Model, ModelProvider } from '@shared/types/modelProviders';
import { describeModel, infoOf } from './facts';
import type { ModelDescription } from './facts';

/** Where a model runs: a cloud API, this device, a server the user runs, or an integration (Apple, Hex). */
export type ModelSource = 'cloud' | 'on-device' | 'your-server' | 'integration';

export interface ModelRecord extends ModelDescription {
  provider: string;
  id: string;
  label: string;
  source: ModelSource;
  /** Can run now; otherwise `hint` is the next step. */
  ready: boolean;
  hint: string | null;
}

export function modelSourceOf(provider: string): ModelSource {
  if (provider === LOCAL_MODELS_CONFIG.provider.id) return 'on-device';
  if (isLocalProviderId(provider)) return 'your-server';
  if (provider in TRANSCRIPTION_CONFIG.integrationByProvider) return 'integration';
  return 'cloud';
}

function recordOf(provider: ModelProvider, model: Model): ModelRecord {
  return {
    provider: provider.provider,
    id: model.id,
    label: getModelDisplayName(model),
    source: modelSourceOf(provider.provider),
    ...describeModel(provider.provider, model),
    ...readinessOf(provider, model),
  };
}

/** Every model on the active sources, described once. */
export function modelRecords(sources: ModelProvider[]): ModelRecord[] {
  return sources.filter((p) => p.active).flatMap((p) => (p.models ?? []).map((m) => recordOf(p, m)));
}

/** A job's suggestions on one provider that the user hasn't added. */
function suggestionsOn(provider: ModelProvider, job: ModelJob): Model[] {
  const suggested: readonly SuggestedModel[] = MODEL_SPINE_CONFIG.suggested[job]?.[provider.provider] ?? [];
  const added = new Set((provider.models ?? []).map((m) => m.id));
  return suggested.filter((s) => !added.has(s.id)).map((s) => ({ id: s.id, name: s.label }));
}

const union = <T>(a: readonly T[], b: T): T[] => (a.includes(b) ? [...a] : [...a, b]);

/** A suggestion is curated for its job, so it does that job whatever else describes it. */
function suggestionRecord(provider: ModelProvider, model: Model, job: ModelJob): ModelRecord {
  const record = recordOf(provider, model);
  const shape = MODEL_SPINE_CONFIG.jobs[job];
  return { ...record, input: union(record.input, shape.input), output: union(record.output, shape.output) };
}

/** A job's models: the added ones that fit it, then its suggestions (curated for it) on each active provider. */
export function jobRecords(sources: ModelProvider[], job: ModelJob): ModelRecord[] {
  const active = sources.filter((p) => p.active);
  const suggestions = active.flatMap((p) => suggestionsOn(p, job).map((m) => suggestionRecord(p, m, job)));
  return [...modelsFor(modelRecords(active), job), ...suggestions];
}

/** A job's models as picker choices; `valueOf` is what the setting stores (a model id by default). */
export function jobChoices(sources: ModelProvider[], job: ModelJob, valueOf: (r: ModelRecord) => string = (r) => r.id): ModelChoice[] {
  return jobRecords(sources, job).map((r) => ({
    value: valueOf(r),
    provider: r.provider,
    modelId: r.id,
    label: r.label,
    ready: r.ready,
    hint: r.hint,
    info: infoOf(r),
  }));
}

/** A model fits a job when it takes the job's input and gives its output (chat: text in, text out). */
export function fitsJob(record: Pick<ModelRecord, 'input' | 'output'>, job: ModelJob): boolean {
  const shape = MODEL_SPINE_CONFIG.jobs[job];
  return record.input.includes(shape.input) && record.output.includes(shape.output);
}

export function modelsFor(records: ModelRecord[], job: ModelJob): ModelRecord[] {
  return records.filter((r) => fitsJob(r, job));
}
