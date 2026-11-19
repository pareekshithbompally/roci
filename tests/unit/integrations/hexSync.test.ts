import { describe, it, expect, vi, beforeEach } from 'vitest';

const hex = vi.hoisted(() => ({ list: vi.fn(), show: vi.fn() }));
const db = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn() }));
const saveTranscript = vi.hoisted(() => vi.fn());
const saveSummary = vi.hoisted(() => vi.fn());

vi.mock('@services/hex/hex.meetings', () => ({ hexMeetings: hex }));
vi.mock('@services/db', () => ({ store: { meetings: { get: db.get, create: db.create } } }));
vi.mock('@services/transcription.service', () => ({ transcriptionService: { saveTranscript, saveSummary } }));

import { hexSync } from '@services/hex/hex.sync';
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

beforeEach(() => {
  vi.clearAllMocks();
  db.get.mockResolvedValue(null);
  hex.show.mockImplementation(async (id: string) => detail(id));
});

describe('hexSync.catchUp', () => {
  it('imports only finished meetings Roci does not have, keeping their own notes', async () => {
    hex.list.mockResolvedValue([meeting('new'), meeting('have'), meeting('live', true)]);
    db.get.mockImplementation(async (id: string) => (id === 'hex-have' ? {} : null));
    await expect(hexSync.catchUp()).resolves.toBe(1);

    expect(db.create).toHaveBeenCalledWith({ id: 'hex-new', title: 'Hex title', status: 'transcribed', inputSource: 'hex', createdAt: 1_000 });
    expect(saveTranscript).toHaveBeenCalledWith({
      meetingId: 'hex-new',
      text: '[00:02] You: We are\n[00:04] Others: Are we?',
      segments: [
        { text: 'We are', startSecond: 2.4, endSecond: 3.44, speaker: 'You' },
        { text: 'Are we?', startSecond: 4, endSecond: 5, speaker: 'Others' },
      ],
    });
    expect(saveSummary).toHaveBeenCalledTimes(1);
    expect(saveSummary.mock.calls[0][0]).toMatchObject({ meetingId: 'hex-new', title: 'Hex title' });
    expect(saveSummary.mock.calls[0][0].summary.overview).toBe('Hex summary');
  });

  it('runs one catch-up at a time', async () => {
    hex.list.mockResolvedValue([]);
    const [a, b] = [hexSync.catchUp(), hexSync.catchUp()];
    await Promise.all([a, b]);
    expect(hex.list).toHaveBeenCalledTimes(1);
  });
});

describe('hexSync.finished', () => {
  it('imports the transcript only and returns the meeting for the pipeline to summarize', async () => {
    await expect(hexSync.finished('h2')).resolves.toBe('hex-h2');
    expect(saveTranscript).toHaveBeenCalledTimes(1);
    expect(saveSummary).not.toHaveBeenCalled();
  });

  it('skips a meeting already in Roci', async () => {
    db.get.mockResolvedValue({});
    await expect(hexSync.finished('h4')).resolves.toBeNull();
    expect(hex.show).not.toHaveBeenCalled();
  });
});
