import { describe, it, expect } from 'vitest';
import { injectCitationTokens } from '@shared/utils/inlineCitationInjector';

import type { InlineCitationSpan } from '@shared/types';

const makeSpan = (
  startIndex: number,
  endIndex: number,
  sourceIndices: number[]
): InlineCitationSpan => ({ startIndex, endIndex, sourceIndices } as InlineCitationSpan);

describe('injectCitationTokens', () => {
  it('returns text unchanged when spans is null-ish', () => {
    expect(injectCitationTokens('hello', null as any)).toBe('hello');
    expect(injectCitationTokens('hello', undefined as any)).toBe('hello');
  });

  it('returns text unchanged for empty spans array', () => {
    expect(injectCitationTokens('hello world', [])).toBe('hello world');
  });

  it('inserts a single citation token at endIndex', () => {
    const text = 'Hello world.';
    const spans = [makeSpan(0, 12, [0])];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Hello world.{{cite:0}}');
  });

  it('inserts multiple citation tokens at different positions', () => {
    const text = 'First sentence. Second sentence.';
    const spans = [
      makeSpan(0, 15, [0]),  // after "First sentence"
      makeSpan(16, 32, [1]), // after "Second sentence."
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('First sentence.{{cite:0}} Second sentence.{{cite:1}}');
  });

  it('merges multiple spans at the same endIndex', () => {
    const text = 'Some claim here.';
    const spans = [
      makeSpan(0, 16, [0]),
      makeSpan(5, 16, [1]),
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Some claim here.{{cite:0,1}}');
  });

  it('sorts source indices in the merged token', () => {
    const text = 'A claim.';
    const spans = [
      makeSpan(0, 8, [3]),
      makeSpan(0, 8, [1]),
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('A claim.{{cite:1,3}}');
  });

  it('skips spans inside fenced code blocks', () => {
    const text = 'Before ```code block``` after.';
    const spans = [
      makeSpan(10, 15, [0]), // inside code block
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe(text); // unchanged
  });

  it('skips spans inside inline code', () => {
    const text = 'Use `someFunction()` for this.';
    const spans = [
      makeSpan(5, 19, [0]), // endIndex inside inline code
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe(text); // unchanged
  });

  it('allows spans outside of code blocks', () => {
    const text = 'Before `code` after.';
    const spans = [
      makeSpan(14, 20, [0]), // after the inline code
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Before `code` after.{{cite:0}}');
  });

  it('handles insertion at the very end of text', () => {
    const text = 'End';
    const spans = [makeSpan(0, 3, [0])];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('End{{cite:0}}');
  });

  it('clamps endIndex to text length', () => {
    const text = 'Short';
    const spans = [makeSpan(0, 100, [0])]; // endIndex beyond text
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Short{{cite:0}}');
  });

  it('skips spans with endIndex <= 0', () => {
    const text = 'Hello';
    const spans = [makeSpan(0, 0, [0]), makeSpan(0, -1, [1])];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Hello');
  });

  it('preserves earlier offsets when inserting from end to start', () => {
    const text = 'AB';
    const spans = [
      makeSpan(0, 1, [0]), // after 'A'
      makeSpan(1, 2, [1]), // after 'B'
    ];
    const result = injectCitationTokens(text, spans);
    // Insertions from end: 'B' gets cite:1 first, then 'A' gets cite:0
    expect(result).toBe('A{{cite:0}}B{{cite:1}}');
  });

  it('deduplicates source indices within a single span at same position', () => {
    const text = 'Claim.';
    const spans = [
      makeSpan(0, 6, [0, 0, 1, 1]),
    ];
    const result = injectCitationTokens(text, spans);
    expect(result).toBe('Claim.{{cite:0,1}}');
  });

  it('handles multiline fenced code block', () => {
    const text = 'Before\n```\ncode\nblock\n```\nAfter.';
    const codeStart = text.indexOf('```');
    const codeEnd = text.indexOf('```', codeStart + 3) + 3;
    const spans = [
      makeSpan(codeStart, codeStart + 5, [0]), // inside code block
      makeSpan(codeEnd, text.length, [1]),       // after code block
    ];
    const result = injectCitationTokens(text, spans);
    // First span skipped (inside code block), second inserted
    expect(result).toBe('Before\n```\ncode\nblock\n```\nAfter.{{cite:1}}');
  });
});
