import { describe, expect, it } from 'vitest';
import { addTerm, parseSoundsLike, removeTerm, updateTerm } from '@features/personalization/utils/vocabulary';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import type { VocabularyEntry } from '@shared/types';

const { maxTermChars, maxEntries, maxSoundsLike } = PERSONALIZATION_CONFIG.vocabulary;
const listOf = (result: ReturnType<typeof addTerm>): VocabularyEntry[] => {
  if ('error' in result) throw new Error(result.error);
  return result.list;
};

describe('vocabulary', () => {
  it('parses a comma-separated sounds-like field, collapsing whitespace', () => {
    expect(parseSoundsLike(' contact  seven , ,contact7 ')).toEqual(['contact seven', 'contact7']);
  });

  it('adds a cleaned term, dropping spellings equal to it or repeated in any case', () => {
    const list = listOf(addTerm([], '  Context7 ', ['context7', 'Contact7', 'contact7', '']));
    expect(list).toEqual([{ term: 'Context7', soundsLike: ['Contact7'] }]);
  });

  it('merges new spellings into an existing term in any case', () => {
    const first = listOf(addTerm([], 'Context7', ['contact7']));
    expect(listOf(addTerm(first, 'context7', ['contact seven']))).toEqual([{ term: 'Context7', soundsLike: ['contact7', 'contact seven'] }]);
  });

  it('refuses an empty term, a long term, too many spellings, and a full list', () => {
    expect(addTerm([], '   ', [])).toHaveProperty('error');
    expect(addTerm([], 'x'.repeat(maxTermChars + 1), [])).toHaveProperty('error');
    expect(addTerm([], 'Term', Array.from({ length: maxSoundsLike + 1 }, (_, i) => `s${i}`))).toHaveProperty('error');
    const full = Array.from({ length: maxEntries }, (_, i) => ({ term: `t${i}`, soundsLike: [] }));
    expect(addTerm(full, 'one more', [])).toHaveProperty('error');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(addTerm([], '😀'.repeat(maxTermChars), [])).toHaveProperty('list');
  });

  it('updates a term in place and refuses renaming onto another term', () => {
    const list = listOf(addTerm(listOf(addTerm([], 'Alpha', [])), 'Beta', []));
    expect(listOf(updateTerm(list, 'alpha', 'Gamma', ['gama']))).toEqual([
      { term: 'Gamma', soundsLike: ['gama'] },
      { term: 'Beta', soundsLike: [] },
    ]);
    expect(updateTerm(list, 'Alpha', 'beta', [])).toHaveProperty('error');
    expect(listOf(updateTerm(list, 'Alpha', 'ALPHA', []))[0].term).toBe('ALPHA');
  });

  it('removes a term in any case', () => {
    expect(removeTerm([{ term: 'Context7', soundsLike: [] }], ' context7 ')).toEqual([]);
  });
});
