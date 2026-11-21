import { describe, expect, it } from 'vitest';
import { withoutPromptEcho } from '@services/ai/transcription/promptEcho';
import type { TranscriptResult } from '@services/ai/transcription/types';

const timed = (...texts: string[]): TranscriptResult => ({
  text: texts.join(' '),
  segments: texts.map((text, i) => ({ text, startSecond: i, endSecond: i + 1 })),
});

describe('prompt echo', () => {
  it('drops a transcript that only reads the term list back', () => {
    expect(withoutPromptEcho({ text: ' T3 Code, Ottobit. ', segments: [] }, 'T3 Code, Ottobit').text).toBe('');
    const echo = withoutPromptEcho(timed('T3 Code, Ottobit.'), 't3 code,ottobit');
    expect(echo.text).toBe('');
    expect(echo.segments).toEqual([]);
  });

  it('drops only the echoing segment', () => {
    const mixed = withoutPromptEcho(timed('T3 Code, Ottobit.', "Let's ship it."), 'T3 Code, Ottobit');
    expect(mixed.text).toBe("Let's ship it.");
    expect(mixed.segments).toHaveLength(1);
  });

  it('keeps speech that contains the terms, and a lone term', () => {
    const speech = timed('We shipped T3 Code today');
    expect(withoutPromptEcho(speech, 'T3 Code, Ottobit')).toBe(speech);
    const single = timed('Ottobit.');
    expect(withoutPromptEcho(single, 'Ottobit')).toBe(single);
  });

  it('reads spoken digits as numerals', () => {
    expect(withoutPromptEcho({ text: 'Context seven, Rune', segments: [] }, 'Context 7, Rune').text).toBe('');
  });
});
