import { describe, it, expect } from 'vitest';
import { stripWebCitations } from '@extensions/tool-orchestrator';

describe('stripWebCitations', () => {
  it('strips [N] markers and <cite> tags', () => {
    expect(stripWebCitations('Paris is the capital[1].')).toBe('Paris is the capital.');
    expect(stripWebCitations('<cite index="1">Paris</cite>')).toBe('Paris');
  });

  it('keeps markdown links', () => {
    expect(stripWebCitations('see [1](https://example.com)')).toBe('see [1](https://example.com)');
  });
});
