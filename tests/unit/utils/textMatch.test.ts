/** Search's one matching rule: every word typed appears, in any order, ignoring case. */

import { describe, it, expect } from 'vitest';
import { matchesAllWords } from '@shared/utils/textMatch';

describe('matchesAllWords', () => {
  it('every word, any order, any case', () => {
    expect(matchesAllWords('Weekly Sync with Design', 'design weekly')).toBe(true);
  });

  it('a missing word fails', () => {
    expect(matchesAllWords('Weekly Sync', 'sync pricing')).toBe(false);
  });

  it('words may be the start of longer ones', () => {
    expect(matchesAllWords('Providers', 'provid')).toBe(true);
  });

  it('an empty query matches nothing', () => {
    expect(matchesAllWords('Anything', '   ')).toBe(false);
  });

});
