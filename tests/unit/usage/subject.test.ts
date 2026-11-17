import { describe, expect, it } from 'vitest';
import { ALL_USAGE, childKinds, subjectFilter, type UsageSubject } from '@features/usage/model/subject';

const sample: Record<'provider' | 'model' | 'feature', UsageSubject> = {
  provider: { kind: 'provider', provider: 'gemini' },
  model: { kind: 'model', provider: 'gemini', model: 'flash' },
  feature: { kind: 'feature', category: 'chat' },
};

describe('usage page tree', () => {
  it('opens only downward: Usage › Provider › Model, Usage › Feature', () => {
    expect([...childKinds(ALL_USAGE)].sort()).toEqual(['feature', 'provider']);
    expect([...childKinds(sample.provider)]).toEqual(['model']);
    expect(childKinds(sample.model).size).toBe(0);
    expect(childKinds(sample.feature).size).toBe(0);
  });

  it('every drill path ends within two steps (no loops)', () => {
    const depth = (s: UsageSubject): number =>
      1 + Math.max(0, ...[...childKinds(s)].map((k) => depth(sample[k])));
    expect(depth(ALL_USAGE)).toBe(3);
  });

  it('filters each page to what it is about', () => {
    expect(subjectFilter(ALL_USAGE)).toEqual({});
    expect(subjectFilter(sample.model)).toEqual({ provider: 'gemini', model: 'flash' });
    expect(subjectFilter(sample.feature)).toEqual({ category: 'chat' });
  });
});
