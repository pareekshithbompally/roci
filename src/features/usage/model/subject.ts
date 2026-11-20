/** What a usage page shows: everything, one provider, one model, one feature (a usage category), or the Model Prices page. */

import type { UsageQuery } from '@extensions/usage';

export type UsageSubject =
  | { kind: 'all' }
  | { kind: 'provider'; provider: string }
  | { kind: 'model'; provider: string; model: string }
  | { kind: 'feature'; category: string }
  | { kind: 'prices' };

/** The whole of usage: the root page. */
export const ALL_USAGE: UsageSubject = { kind: 'all' };

/** Model Prices: opened from the root page's estimated cost. */
export const MODEL_PRICES: UsageSubject = { kind: 'prices' };

/** The one kind of page a page opens: the root opens providers and features, a provider its models; models and features are leaves.
 *  A strict tree, so drilling always goes down and ends. */
export type UsageChildKind = 'provider' | 'feature' | 'model';

export function childKinds(subject: UsageSubject): ReadonlySet<UsageChildKind> {
  if (subject.kind === 'all') return new Set(['provider', 'feature']);
  if (subject.kind === 'provider') return new Set(['model']);
  return new Set();
}

/** The query filter a subject adds to its window. */
export function subjectFilter(subject: UsageSubject): Pick<UsageQuery, 'provider' | 'model' | 'category'> {
  if (subject.kind === 'provider') return { provider: subject.provider };
  if (subject.kind === 'model') return { provider: subject.provider, model: subject.model };
  if (subject.kind === 'feature') return { category: subject.category };
  return {};
}

/** Model id without its org prefix ("ggml-org/gemma…" → "gemma…"); the org shows as the row's avatar. */
export const modelName = (id: string) => id.slice(id.lastIndexOf('/') + 1);
