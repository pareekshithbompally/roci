/** Chat about a meeting while it records: find searches inside one meeting, and read gives its transcript so far. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchMeetings = vi.hoisted(() => vi.fn());
vi.mock('@extensions/rag/searchIndex', () => ({ searchMeetings, searchChats: vi.fn() }));
vi.mock('@extensions/rag', () => ({ indexStretch: vi.fn(async () => []) }));
const meetingGet = vi.hoisted(() => vi.fn());
vi.mock('@services/db', () => ({ store: { meetings: { get: meetingGet } } }));

// eslint-disable-next-line import/first
import { findTool } from '@extensions/tools/definitions/find.tool';
// eslint-disable-next-line import/first
import { readTool } from '@extensions/tools/definitions/read.tool';
// eslint-disable-next-line import/first
import { meetingLiveActions } from '@features/recording/live/meetingLiveStore';

const ctx = { approval: 'chat' as const };
const hit = (chunkText: string, score: number) => ({ meetingId: 'm1', meetingTitle: 'Sync', timestamp: 0, chunkText, score });

beforeEach(() => {
  searchMeetings.mockReset();
  meetingGet.mockReset();
});

describe('find in one meeting', () => {
  it('returns that meeting\'s matching passages, searched within it', async () => {
    searchMeetings.mockResolvedValue([hit('Others: Budget is approved.', 0.9), hit('You: Budget for Q4?', 0.5)]);
    const out = await findTool.execute({ in: 'meetings', query: 'budget', meeting_id: 'm1' }, ctx);
    expect(searchMeetings).toHaveBeenCalledWith('budget', 5, 'm1');
    expect(out.content).toContain('2 passage(s) of "Sync" (meeting ID: m1)');
    expect(out.content).toContain('"Others: Budget is approved."');
    expect(out.content).toContain('"You: Budget for Q4?"');
  });

  it('without a meeting, searches every meeting as before', async () => {
    searchMeetings.mockResolvedValue([hit('Budget approved.', 0.9)]);
    await findTool.execute({ in: 'meetings', query: 'budget' }, ctx);
    expect(searchMeetings).toHaveBeenCalledWith('budget', 5);
  });
});

describe('read a meeting being recorded', () => {
  it('gives its transcript so far when none is saved yet', async () => {
    meetingLiveActions.start('m1');
    meetingLiveActions.set([{ source: 'system', startMs: 0, endMs: 1_000, text: 'Budget is approved.', timed: false }]);
    meetingGet.mockResolvedValue({ index: { id: 'm1', title: 'Sync', createdAt: '2026-11-26T01:50:00Z' }, notes: [], todos: [], transcript: null });
    const out = await readTool.execute({ meeting_id: 'm1', parts: ['transcript'] }, ctx);
    expect(out.content).toContain('### Transcript\nOthers: Budget is approved.');
    meetingLiveActions.end();
  });
});
