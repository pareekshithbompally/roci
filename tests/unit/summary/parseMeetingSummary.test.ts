import { describe, expect, it } from 'vitest';
import { parseAnalysis, parseMeetingSummary } from '@core/ai';

describe('parseMeetingSummary', () => {
  it('fills every list a model left out, so readers never crash', () => {
    const summary = parseMeetingSummary({ overview: 'Done.' });
    expect(summary).toEqual({ overview: 'Done.', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] });
  });

  it('drops malformed items and keeps good ones', () => {
    const summary = parseMeetingSummary({ keyDiscussionPoints: ['a', 3, '', null], actionItems: [{ text: 'Do it', owner: 7 }, { owner: 'x' }] });
    expect(summary.keyDiscussionPoints).toEqual(['a']);
    expect(summary.actionItems).toEqual([{ text: 'Do it', owner: undefined, dueDate: undefined }]);
  });

  it('reads garbage as an empty summary', () => {
    expect(parseMeetingSummary('nope').keyDiscussionPoints).toEqual([]);
    expect(parseMeetingSummary(undefined).overview).toBe('');
  });
});

describe('parseAnalysis', () => {
  it('rejects a reply with no summary in it', () => {
    expect(() => parseAnalysis({ title: 'x' })).toThrow("The model's reply had no summary in it.");
  });

  it('keeps a reply missing some lists', () => {
    const result = parseAnalysis({ title: ' Launch ', summary: { overview: 'We planned.' } });
    expect(result.title).toBe('Launch');
    expect(result.summary.decisionsMade).toEqual([]);
    expect(result.categories).toEqual([]);
  });
});
