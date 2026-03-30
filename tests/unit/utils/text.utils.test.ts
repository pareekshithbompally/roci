import { describe, it, expect } from 'vitest';
import { truncateForLLM } from '@shared/utils/text.utils';

describe('truncateForLLM', () => {
  it('returns empty string as-is', () => {
    expect(truncateForLLM('', 100)).toBe('');
  });

  it('returns falsy input as-is', () => {
    // @ts-expect-error testing null/undefined edge
    expect(truncateForLLM(null, 100)).toBeNull();
    // @ts-expect-error testing undefined edge
    expect(truncateForLLM(undefined, 100)).toBeUndefined();
  });

  it('returns short text unchanged when within limit', () => {
    const text = 'Hello world';
    expect(truncateForLLM(text, 100)).toBe(text);
  });

  it('returns text unchanged when exactly at limit', () => {
    const text = 'a'.repeat(50);
    expect(truncateForLLM(text, 50)).toBe(text);
  });

  it('truncates at sentence boundary when found after 60% mark', () => {
    // Build text where a sentence ends after 60% of maxChars
    // maxChars = 100, so sentence end must be after char 60
    const firstSentence = 'A'.repeat(70) + '.';  // 71 chars, sentence ends at index 70
    const rest = ' ' + 'B'.repeat(100);           // push total well over 100
    const text = firstSentence + rest;

    const result = truncateForLLM(text, 100);
    // Should cut after the period (index 70) -> slice(0, 71)
    expect(result).toContain('A'.repeat(70) + '.');
    expect(result).toContain('[Truncated');
    expect(result).not.toContain('B'.repeat(50));
  });

  it('falls back to newline boundary when no sentence end after 60%', () => {
    // No sentence-ending punctuation, but a newline after 60%
    const line1 = 'A'.repeat(75);  // 75 chars
    const line2 = 'B'.repeat(100); // more than enough to exceed maxChars
    const text = line1 + '\n' + line2;

    const result = truncateForLLM(text, 100);
    expect(result).toContain(line1);
    expect(result).toContain('[Truncated');
  });

  it('does hard cut when no suitable sentence or newline boundary', () => {
    // Single long word with no sentence ends or newlines
    const text = 'A'.repeat(200);
    const result = truncateForLLM(text, 100);
    expect(result).toContain('A'.repeat(100));
    expect(result).toContain('[Truncated — 100 chars omitted]');
  });

  it('does not cut at sentence boundary before 60% mark', () => {
    // Sentence ends very early (at 20%), should not be used
    const text = 'Hi. ' + 'A'.repeat(200);
    const result = truncateForLLM(text, 100);
    // The sentence boundary at index 2 is at 2% — way below 60%
    // Should fall through to newline or hard cut
    expect(result).toContain('[Truncated');
  });

  it('truncation notice includes correct omitted char count', () => {
    const text = 'A'.repeat(500);
    const result = truncateForLLM(text, 100);
    // Hard cut: omitted = 500 - 100 = 400
    expect(result).toContain('400 chars omitted');
  });

  it('sentence boundary: includes the punctuation character', () => {
    // "Hello world! " at position > 60% of window
    const padding = 'X'.repeat(65);
    const text = padding + 'Done! ' + 'Y'.repeat(200);
    const result = truncateForLLM(text, 100);
    // Should include up to and including the '!'
    expect(result).toContain('Done!');
    expect(result).toContain('[Truncated');
  });

  it('handles text with only newlines for structure', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n');
    const result = truncateForLLM(lines, 50);
    expect(result).toContain('[Truncated');
    // Should have cut at a newline boundary
  });

  it('prefers sentence boundary over newline when both available', () => {
    // Sentence end at ~75%, newline at ~80%
    const text = 'A'.repeat(72) + '. ' + 'B'.repeat(3) + '\n' + 'C'.repeat(200);
    const result = truncateForLLM(text, 100);
    // The sentence regex looks for [.!?][\s\n] — the '. ' at index 72
    // That's at 72% > 60%, so it should cut there
    expect(result.startsWith('A'.repeat(72) + '.')).toBe(true);
  });
});
