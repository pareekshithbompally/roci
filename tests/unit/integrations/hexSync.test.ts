import { describe, it, expect, vi, beforeEach } from 'vitest';

const hex = vi.hoisted(() => ({ list: vi.fn(), show: vi.fn() }));
const db = vi.hoisted(() => ({ existing: vi.fn() }));
const importMeeting = vi.hoisted(() => vi.fn());
const saveSummary = vi.hoisted(() => vi.fn());

vi.mock('@services/hex/hex.meetings', () => ({ hexMeetings: hex }));
vi.mock('@services/db', () => ({ store: { meetings: { existing: db.existing } } }));
vi.mock('@services/transcription.service', () => ({ transcriptionService: { importMeeting, saveSummary } }));

import { hexSync } from '@services/hex/hex.sync';
import type { HexMeetingDetail } from '@services/hex';

const meeting = (id: string, in_progress = false) => ({ id, title: `Meeting ${id}`, timestamp_ms: 1_000, duration_ms: 5_000, status: 'complete' as const, in_progress });
const detail = (id: string, notes: HexMeetingDetail['notes'] = { title: 'Hex title', summary: 'Hex summary' }): HexMeetingDetail => ({
  meeting: meeting(id),
  notes,
  entries: [
    { source: 'microphone', start_ms: 2400, end_ms: 3440, text: 'We are' },
    { source: 'system', start_ms: 4000, end_ms: 5000, text: 'Are we?' },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.existing.mockResolvedValue([]);
  importMeeting.mockResolvedValue(true);
  hex.show.mockImplementation(async (id: string) => detail(id));
});

describe('hexSync.catchUp', () => {
  it('imports each finished meeting with its transcript in one write, keeping Hex\'s notes', async () => {
    hex.list.mockResolvedValue([meeting('new'), meeting('live', true)]);
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 1, toSummarize: [], failed: 0 });

    expect(importMeeting).toHaveBeenCalledWith(
      { id: 'hex-new', title: 'Hex title', inputSource: 'hex', createdAt: 1_000 },
      {
        text: '[00:02] You: We are\n[00:04] Others: Are we?',
        segments: [
          { text: 'We are', startSecond: 2.4, endSecond: 3.44, speaker: 'You' },
          { text: 'Are we?', startSecond: 4, endSecond: 5, speaker: 'Others' },
        ],
      },
    );
    expect(saveSummary.mock.calls[0][0]).toMatchObject({ meetingId: 'hex-new', title: 'Hex title' });
    expect(saveSummary.mock.calls[0][0].summary.overview).toBe('Hex summary');
  });

  it('a meeting without Hex notes goes to the pipeline to be summarized, never saved empty', async () => {
    hex.list.mockResolvedValue([meeting('bare')]);
    hex.show.mockResolvedValue(detail('bare', null));
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 1, toSummarize: ['hex-bare'], failed: 0 });
    expect(saveSummary).not.toHaveBeenCalled();
  });

  it('a meeting whose Hex notes fail to save is summarized instead, not counted as failed', async () => {
    hex.list.mockResolvedValue([meeting('n')]);
    saveSummary.mockRejectedValueOnce(new Error('disk full'));
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 1, toSummarize: ['hex-n'], failed: 0 });
  });

  it('one meeting that fails is counted, and the rest still import', async () => {
    hex.list.mockResolvedValue([meeting('broken'), meeting('fine')]);
    hex.show.mockImplementation(async (id: string) => {
      if (id === 'broken') throw new Error('hex cli failed');
      return detail(id);
    });
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 1, toSummarize: [], failed: 1 });
    expect(importMeeting).toHaveBeenCalledTimes(1);
  });

  it('a meeting another import got to first is skipped quietly', async () => {
    hex.list.mockResolvedValue([meeting('raced')]);
    importMeeting.mockResolvedValue(false);
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 0, toSummarize: [], failed: 0 });
    expect(saveSummary).not.toHaveBeenCalled();
  });

  it('runs one catch-up at a time', async () => {
    hex.list.mockResolvedValue([]);
    const [a, b] = [hexSync.catchUp(), hexSync.catchUp()];
    expect(a).toBe(b);
    await a;
    expect(hex.list).toHaveBeenCalledTimes(1);
  });
});

describe('hexSync.finished', () => {
  it('imports the transcript only and returns the meeting for the pipeline to summarize', async () => {
    await expect(hexSync.finished('m1')).resolves.toBe('hex-m1');
    expect(importMeeting).toHaveBeenCalledTimes(1);
    expect(saveSummary).not.toHaveBeenCalled();
  });

  it('is nothing when Roci already has the meeting, or another import got there first', async () => {
    db.existing.mockResolvedValue(['hex-m1']);
    await expect(hexSync.finished('m1')).resolves.toBeNull();
    db.existing.mockResolvedValue([]);
    importMeeting.mockResolvedValue(false);
    await expect(hexSync.finished('m1')).resolves.toBeNull();
  });
});

describe('hexSync.catchUp, already kept', () => {
  it('asks the store once which meetings it has, and imports only the others', async () => {
    hex.list.mockResolvedValue([meeting('m1'), meeting('m2')]);
    db.existing.mockResolvedValue(['hex-m1']);
    await expect(hexSync.catchUp()).resolves.toEqual({ imported: 1, toSummarize: [], failed: 0 });
    expect(db.existing).toHaveBeenCalledTimes(1);
    expect(hex.show).toHaveBeenCalledWith('m2');
    expect(hex.show).not.toHaveBeenCalledWith('m1');
  });
});
