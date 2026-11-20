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

  it('starts a paragraph at each [MM:SS] prefix and strips caption artifacts', () => {
    const blocks = blocksFromText('[00:05] First\\h\npart.\n[01:10] Second.');
    expect(blocks.map((b) => b.text)).toEqual(['First part.', 'Second.']);
  });

  it('splits long text at a sentence end', () => {
    const sentence = (w: string) => `${w} `.repeat(120).trim() + '.';
    const blocks = blocksFromText(`${sentence('alpha')}\n${sentence('beta')}`);
    expect(blocks).toHaveLength(2);
  });
});

describe('blocksFromSegments', () => {
  it('reads as speaker turns: a speaker\'s close lines join, a new speaker or a pause starts a turn', () => {
    const blocks = blocksFromSegments([
      { text: 'Life seems decent, it is not', startSecond: 2, endSecond: 8, speaker: 'You' },
      { text: 'complicated at all.', startSecond: 8.4, endSecond: 12, speaker: 'You' },
      { text: 'Agreed.', startSecond: 12.5, endSecond: 13, speaker: 'Others' },
      { text: 'Next point.', startSecond: 20, endSecond: 22, speaker: 'Others' },
    ]);
    expect(blocks).toEqual([
      { speaker: 'You', text: 'Life seems decent, it is not complicated at all.', silenceBefore: undefined },
      { speaker: 'Others', text: 'Agreed.', silenceBefore: undefined },
      { speaker: 'Others', text: 'Next point.', silenceBefore: undefined },
    ]);
  });

  it('marks a long silence before a turn instead of timing every line', () => {
    const blocks = blocksFromSegments([
      { text: 'Before.', startSecond: 0, endSecond: 4, speaker: 'You' },
      { text: 'After.', startSecond: 76, endSecond: 80, speaker: 'You' },
    ]);
    expect(blocks[1]).toEqual({ speaker: 'You', text: 'After.', silenceBefore: '1:12' });
  });
});
