/** Custom vocabulary editing rules: one cleaned entry per term (case-insensitive), within the configured limits. */

import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import type { VocabularyEntry } from '@shared/types';

const { maxTermChars, maxEntries, maxSoundsLike } = PERSONALIZATION_CONFIG.vocabulary;
const COPY = PERSONALIZATION_CONFIG.copy.vocabulary;

/** The list after an edit, or why the edit was refused. */
export type VocabularyResult = { list: VocabularyEntry[] } | { error: string };

/** Runs of whitespace collapsed to one space, ends trimmed. */
const clean = (text: string): string => text.split(/\s+/).filter(Boolean).join(' ');

const same = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

const indexOf = (list: VocabularyEntry[], term: string): number => list.findIndex((entry) => same(entry.term, term));

/** The words a search matches an entry by: its term and its spellings. */
export const entryText = ({ term, soundsLike }: VocabularyEntry): string => [term, ...soundsLike].join(' ');

/** A comma-separated "sounds like" field as its spellings. */
export function parseSoundsLike(raw: string): string[] {
  return raw.split(',').map(clean).filter(Boolean);
}

/** `spellings` cleaned, without empties, the term itself, or repeats (in any case). */
function distinctSpellings(term: string, spellings: string[]): string[] {
  return spellings.map(clean).reduce<string[]>((kept, spelling) => {
    if (!spelling || same(spelling, term) || kept.some((k) => same(k, spelling))) return kept;
    return [...kept, spelling];
  }, []);
}

/** The entry as it is saved, or why it can't be. Lengths count characters, not UTF-16 units. */
function validEntry(rawTerm: string, rawSpellings: string[]): { entry: VocabularyEntry } | { error: string } {
  const term = clean(rawTerm);
  if (!term) return { error: COPY.empty };
  const soundsLike = distinctSpellings(term, rawSpellings);
  const long = [term, ...soundsLike].find((text) => [...text].length > maxTermChars);
  if (long) return { error: COPY.tooLong(long, maxTermChars) };
  if (soundsLike.length > maxSoundsLike) return { error: COPY.tooManySpellings(maxSoundsLike) };
  return { entry: { term, soundsLike } };
}

/** Adds a term at the end, or merges new spellings into the entry already there for it. */
export function addTerm(list: VocabularyEntry[], term: string, soundsLike: string[]): VocabularyResult {
  const valid = validEntry(term, soundsLike);
  if ('error' in valid) return valid;
  const existing = indexOf(list, valid.entry.term);
  if (existing === -1) {
    return list.length >= maxEntries ? { error: COPY.full(maxEntries) } : { list: [...list, valid.entry] };
  }
  const merged = distinctSpellings(valid.entry.term, [...list[existing].soundsLike, ...valid.entry.soundsLike]);
  if (merged.length > maxSoundsLike) return { error: COPY.tooManySpellings(maxSoundsLike) };
  return { list: list.map((entry, i) => (i === existing ? { ...entry, soundsLike: merged } : entry)) };
}

/** Replaces the entry for `previous` in place (its priority kept) with the edited term and spellings. */
export function updateTerm(list: VocabularyEntry[], previous: string, term: string, soundsLike: string[]): VocabularyResult {
  const valid = validEntry(term, soundsLike);
  if ('error' in valid) return valid;
  const at = indexOf(list, previous);
  const clash = indexOf(list, valid.entry.term);
  if (clash !== -1 && clash !== at) return { error: COPY.duplicate(valid.entry.term) };
  return { list: list.map((entry, i) => (i === at ? valid.entry : entry)) };
}

/** The list without the entry for `term`. */
export function removeTerm(list: VocabularyEntry[], term: string): VocabularyEntry[] {
  return list.filter((entry) => !same(entry.term, clean(term)));
}
