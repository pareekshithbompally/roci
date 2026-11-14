import { describe, it, expect } from 'vitest';
import { blocksFromText, blocksFromSegments } from '@features/transcription/utils/transcriptBlocks';

describe('blocksFromText', () => {
  it('collapses repeated caption lines and reflows wraps into one paragraph', () => {
    const blocks = blocksFromText('Hello there\nHello there\nHello there\nhow are you.\nhow are you.');
    expect(blocks).toEqual([{ speaker: undefined, text: 'Hello there how are you.' }]);
  });

  it('reads [Name] lines as speaker turns', () => {
    const blocks = blocksFromText('Intro line.\n[Homeowner]\nNobody cares.\n[Realtor]\nPeople frighten me.');
    expect(blocks.map((b) => [b.speaker, b.text])).toEqual([
      [undefined, 'Intro line.'],
      ['Homeowner', 'Nobody cares.'],
      ['Realtor', 'People frighten me.'],
    ]);
  });

  it('reads [MM:SS] prefixes as times and strips caption artifacts', () => {
    const blocks = blocksFromText('[00:05] First\\h\npart.\n[01:10] Second.');
    expect(blocks.map((b) => [b.time, b.text])).toEqual([['00:05', 'First part.'], ['01:10', 'Second.']]);
  });

  it('splits long text at a sentence end', () => {
    const sentence = (w: string) => `${w} `.repeat(120).trim() + '.';
    const blocks = blocksFromText(`${sentence('alpha')}\n${sentence('beta')}`);
    expect(blocks).toHaveLength(2);
  });
});

describe('blocksFromSegments', () => {
  it('formats times only when the segments carry timing', () => {
    expect(blocksFromSegments([{ text: ' a ', startSecond: 0, endSecond: 0 }])[0]).toEqual({ speaker: undefined, time: undefined, text: 'a' });
    expect(blocksFromSegments([{ text: 'b', startSecond: 65, endSecond: 70, speaker: 'A' }])[0]).toEqual({ speaker: 'A', time: '01:05', text: 'b' });
  });
});
