import { describe, it, expect, vi, beforeEach } from 'vitest';

const hex = vi.hoisted(() => ({ list: vi.fn(), show: vi.fn() }));
const db = vi.hoisted(() => ({ get: vi.fn() }));
const save = vi.hoisted(() => vi.fn());
const processTranscript = vi.hoisted(() => vi.fn());
const jobs = vi.hoisted(() => ({ set: vi.fn(), clear: vi.fn() }));

vi.mock('@services/hex/hex.meetings', () => ({ hexMeetings: hex }));
vi.mock('@services/db', () => ({ store: { meetings: { get: db.get } } }));
vi.mock('@services/transcription.service', () => ({
  transcriptionService: { saveTranscriptionResult: save },
  meetingSummaryOf: (r: { summary: string }) => ({ overview: r.summary, keyDiscussionPoints: [], decisionsMade: [], actionItems: [{ text: 'ship it' }], nextSteps: [] }),
}));
vi.mock('@services/unifiedAIService', () => ({ unifiedAIService: { processTranscript } }));
vi.mock('@shared/stores/meetingJobsStore', () => ({ meetingJobs: jobs }));

import { hexSync, toTranscriptionResult } from '@services/hex/hex.sync';
import type { HexMeetingDetail } from '@services/hex';

const meeting = (id: string, in_progress = false) => ({ id, title: `Meeting ${id}`, timestamp_ms: 1_000, duration_ms: 5_000, status: 'complete' as const, in_progress });
const detail = (id: string): HexMeetingDetail => ({
  meeting: meeting(id),
  notes: { title: 'Hex title', summary: 'Hex summary' },
  entries: [
    { source: 'microphone', start_ms: 2400, end_ms: 3440, text: 'We are' },
    { source: 'system', start_ms: 4000, end_ms: 5000, text: 'Are we?' },
  ],
});
const context = { settings: {} as never, providers: [], categories: [] };

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue(null);
  hex.show.mockImplementation(async (id: string) => detail(id));
});

describe('toTranscriptionResult', () => {
  it('maps a Hex meeting onto a Kasset save: id, Hex notes, You/Them segments, original time', () => {
    const result = toTranscriptionResult(detail('h1'));
    expect(result.meetingId).toBe('hex-h1');
    expect(result.title).toBe('Hex title');
    expect(result.summary.overview).toBe('Hex summary');
    expect(result.segments).toEqual([
      { text: 'We are', startSecond: 2.4, endSecond: 3.44, speaker: 'You' },
      { text: 'Are we?', startSecond: 4, endSecond: 5, speaker: 'Them' },
    ]);
    expect(result.transcript).toBe('You: We are\nThem: Are we?');
    expect(result.inputSource).toBe('hex');
    expect(result.createdAt).toBe(1_000);
  });
});

describe('hexSync.catchUp', () => {
  it('imports only finished meetings Kasset does not have, with Hex notes and no summary model', async () => {
    hex.list.mockResolvedValue([meeting('new'), meeting('have'), meeting('live', true)]);
    db.get.mockImplementation(async (id: string) => (id === 'hex-have' ? {} : null));
    await expect(hexSync.catchUp()).resolves.toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].meetingId).toBe('hex-new');
    expect(processTranscript).not.toHaveBeenCalled();
  });

  it('runs one catch-up at a time', async () => {
    hex.list.mockResolvedValue([]);
    const [a, b] = [hexSync.catchUp(), hexSync.catchUp()];
    await Promise.all([a, b]);
    expect(hex.list).toHaveBeenCalledTimes(1);
  });
});

describe('hexSync.finished', () => {
  it('imports, then summarizes with the Summary model and clears the phase', async () => {
    processTranscript.mockResolvedValue({ title: 'Better title', summary: 'Full', categories: ['Work'] });
    await hexSync.finished('h2', context);
    expect(processTranscript.mock.calls[0][5]).toEqual({ meetingId: 'hex-h2' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(jobs.set).toHaveBeenCalledWith('hex-h2', { stage: 'summarizing' });
    expect(save.mock.calls[1][0]).toMatchObject({ meetingId: 'hex-h2', title: 'Better title', categories: ['Work'] });
    expect(save.mock.calls[1][0].summary.actionItems).toEqual([{ text: 'ship it' }]);
    expect(jobs.clear).toHaveBeenCalledWith('hex-h2');
  });

  it('keeps the Hex import and shows Failed when the summary fails (no silent fallback)', async () => {
    processTranscript.mockRejectedValue(new Error('No API key'));
    await hexSync.finished('h3', context);
    expect(save).toHaveBeenCalledTimes(1);
    expect(jobs.set).toHaveBeenLastCalledWith('hex-h3', { stage: 'failed', failedAt: 'summarize', message: 'No API key' });
  });

  it('skips a meeting already in Kasset', async () => {
    db.get.mockResolvedValue({});
    await hexSync.finished('h4', context);
    expect(hex.show).not.toHaveBeenCalled();
  });
});
