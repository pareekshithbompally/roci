/** Model reports: what one source says about a model, read from any list format and kept on the saved model. */

import { MODEL_SPINE_CONFIG } from '@config/modelSpine.config';
import type { Modality } from '@config/modelSpine.config';
import type { Model, ModelReport } from '@shared/types/modelProviders';

const isModality = (m: string): m is Modality => (MODEL_SPINE_CONFIG.modalities as readonly string[]).includes(m);

/** The modalities Roci knows out of a source's list, each source's own words read as Roci's (`file` → `pdf`); the rest
 *  are dropped, and each is kept once. */
export const toModalities = (raw: readonly string[]): Modality[] => [
  ...new Set(raw.map((m) => MODEL_SPINE_CONFIG.modalityAliases[m] ?? m).filter(isModality)),
];

/** The report without the facts it leaves unset. */
const statedFacts = (report: ModelReport): ModelReport =>
  Object.fromEntries(Object.entries(report).filter(([, value]) => value !== undefined)) as ModelReport;

/** The report says something (a bare model id says nothing). */
export const isEmptyReport = (report: ModelReport | undefined): boolean => !report || Object.keys(statedFacts(report)).length === 0;

/** A fresh report over the last one: what it states wins, what it leaves unset is kept (llama-server states tools only while loaded). */
export const mergeReports = (previous: ModelReport | undefined, next: ModelReport): ModelReport => ({ ...previous, ...statedFacts(next) });

const sameReport = (a: ModelReport | undefined, b: ModelReport): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b);

/** One model a provider's list names, with what the list says about it. */
export interface ListedModel {
  id: string;
  report: ModelReport;
  /** In memory now; only servers that say so (llama-server, LM Studio) set it. */
  loaded?: boolean;
}

/** The saved model with a fresh report merged in; the same object when nothing changed. */
function withReport(model: Model, report: ModelReport | undefined): Model {
  if (!report || isEmptyReport(report)) return model;
  const merged = mergeReports(model.reported, report);
  return sameReport(model.reported, merged) ? model : { ...model, reported: merged };
}

/** Saved models with what the list now says about each; the same array when nothing changed, so callers skip the save. */
export function withReports(models: Model[], listing: ListedModel[]): Model[] {
  const byId = new Map(listing.map((m) => [m.id, m.report]));
  const next = models.map((m) => withReport(m, byId.get(m.id)));
  return next.every((m, i) => m === models[i]) ? models : next;
}
