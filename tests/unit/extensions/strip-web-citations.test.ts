import { describe, it, expect } from 'vitest';
import { stripWebCitations } from '@extensions/tool-orchestrator';

describe('stripWebCitations', () => {
  it('leaves text untouched when web search is off', () => {
    expect(stripWebCitations('const first = arr[0];', false)).toBe('const first = arr[0];');
    expect(stripWebCitations('<cite>kept</cite>', false)).toBe('<cite>kept</cite>');
  });

  it('strips [N] markers and <cite> tags when web search is on', () => {
    expect(stripWebCitations('Paris is the capital[1].', true)).toBe('Paris is the capital.');
    expect(stripWebCitations('<cite index="1">Paris</cite>', true)).toBe('Paris');
  });

  it('keeps markdown links when web search is on', () => {
    expect(stripWebCitations('see [1](https://example.com)', true)).toBe('see [1](https://example.com)');
  });
});
