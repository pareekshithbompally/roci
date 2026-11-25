/** The running meeting as chat reads it: its transcript in time order, labelled by who spoke, its newest part from a line's start. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@extensions/rag', () => ({ indexStretch: vi.fn(async () => []) }));

// eslint-disable-next-line import/first
import { latestOf, transcriptText } from '@features/recording/live/liveText';
// eslint-disable-next-line import/first
import { meetingLiveActions, runningTranscript } from '@features/recording/live/meetingLiveStore';
// eslint-disable-next-line import/first
import { formatClock } from '@shared/utils/formatters';
// eslint-disable-next-line import/first
import type { LiveEntry } from '@features/recording/live/liveTranscript';

const entry = (source: LiveEntry['source'], startMs: number, text: string, timed = true): LiveEntry =>
  ({ source, startMs, endMs: startMs + 1_000, text, timed });

beforeEach(() => meetingLiveActions.start('m1'));

describe('transcriptText', () => {
  it('writes the lines in time order, with times only when the model gave them', () => {
    const text = transcriptText([entry('microphone', 65_000, 'second'), entry('system', 5_000, 'first', false)]);
    expect(text).toBe(`Others: first\n[${formatClock(65)}] You: second`);
  });
});

describe('latestOf', () => {
  it('keeps the newest characters, starting at a line', () => {
    expect(latestOf('one\ntwo\nthree', 100)).toBe('one\ntwo\nthree');
    expect(latestOf('one\ntwo\nthree', 8)).toBe('three');
  });
});

describe('runningTranscript', () => {
  it('is the transcript so far of the meeting being recorded, none for another or once it ends', () => {
    meetingLiveActions.set([entry('system', 0, 'Budget approved.', false)]);
    expect(runningTranscript('m1')).toBe('Others: Budget approved.');
    expect(runningTranscript('m2')).toBeNull();
    meetingLiveActions.end();
    expect(runningTranscript('m1')).toBeNull();
  });
});
