/** The model registry: one record per model across every source, and which records fit a job. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { ModelJob } from '@config/modelSpine.config';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { readinessOf } from '@shared/utils/modelResolver';
import { getModelDisplayName, isLocalProviderId } from '@shared/utils/provider.utils';
import type { ModelProvider } from '@shared/types/modelProviders';
import { describeModel } from './facts';
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

/** Every model on the active sources, described once. */
export function modelRecords(sources: ModelProvider[]): ModelRecord[] {
  return sources
    .filter((p) => p.active)
    .flatMap((p) => (p.models ?? []).map((m) => ({
      provider: p.provider,
      id: m.id,
      label: getModelDisplayName(m),
      source: modelSourceOf(p.provider),
      ...describeModel(p.provider, m),
      ...readinessOf(p, m),
    })));
}

/** A model fits a job when it takes the job's input and gives its output (chat: text in, text out). */
export function fitsJob(record: Pick<ModelRecord, 'input' | 'output'>, job: ModelJob): boolean {
  const shape = MODEL_SPINE_CONFIG.jobs[job];
  return record.input.includes(shape.input) && record.output.includes(shape.output);
}

export function modelsFor(records: ModelRecord[], job: ModelJob): ModelRecord[] {
  return records.filter((r) => fitsJob(r, job));
}
