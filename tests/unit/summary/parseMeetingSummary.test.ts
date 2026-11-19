import { describe, expect, it } from 'vitest';
import { parseMeetingSummary } from '@core/ai';

describe('parseMeetingSummary', () => {
  it('fills every list a model left out, so readers never crash', () => {
    const summary = parseMeetingSummary({ overview: 'Done.' });
    expect(summary).toEqual({ overview: 'Done.', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [], enhancedNotes: [] });
  });

  it('drops malformed items and keeps good ones', () => {
    const summary = parseMeetingSummary({ keyDiscussionPoints: ['a', 3, '', '  ', null], actionItems: [{ text: 'Do it', owner: 7 }, { owner: 'x' }] });
    expect(summary.keyDiscussionPoints).toEqual(['a']);
    expect(summary.actionItems).toEqual([{ text: 'Do it' }]);
  });

  it('reads garbage as an empty summary', () => {
    expect(parseMeetingSummary('nope').keyDiscussionPoints).toEqual([]);
    expect(parseMeetingSummary(undefined).overview).toBe('');
    expect(parseMeetingSummary({ keyDiscussionPoints: 'not a list' }).keyDiscussionPoints).toEqual([]);
  });
});
