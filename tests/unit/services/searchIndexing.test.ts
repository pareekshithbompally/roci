import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MeetingDetail } from '@shared/types';

const getMeetingDetail = vi.fn();
const indexMeeting = vi.fn();
const isEmbeddingAvailable = vi.fn();

vi.mock('@services/meeting.service', () => ({ meetingService: { getMeetingDetail: (id: string) => getMeetingDetail(id) } }));
vi.mock('@services/db', () => ({ store: {} }));
vi.mock('@extensions/rag', () => ({
  ragIndexer: { indexMeeting: (...args: unknown[]) => indexMeeting(...args) },
  isEmbeddingAvailable: () => isEmbeddingAvailable(),
}));

const { searchIndexingService } = await import('@services/searchIndexing.service');

function meeting(status: string): MeetingDetail {
  return {
    index: { id: 'm1', title: 'Weekly sync', categories: [], createdAt: '2026-11-19T09:00:00Z', status: { status } },
    transcript: { text: 'We agreed to ship on Friday.' },
    summary: { overview: 'Shipping Friday.', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] },
    notes: [{ id: 'n1', text: 'Ask Priya about QA', createdAt: '2026-11-19T09:05:00Z' }],
    todos: [{ id: 't1', text: 'Book the demo room', completed: false }],
  } as unknown as MeetingDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  indexMeeting.mockResolvedValue({ status: 'indexed', chunkCount: 3, embeddingCount: 3 });
});

describe('indexMeeting (a finished meeting)', () => {
  it('indexes a ready meeting in full — transcript, summary, notes and to-dos — with vectors when the model is downloaded', async () => {
    getMeetingDetail.mockResolvedValue(meeting('ready'));
    isEmbeddingAvailable.mockResolvedValue(true);
    await searchIndexingService.indexMeeting('m1');
    const [item, options] = indexMeeting.mock.calls[0];
    expect(options).toEqual({ includeEmbeddings: true });
    expect(item).toMatchObject({
      id: 'm1',
      transcript: 'We agreed to ship on Friday.',
      userNotes: [{ id: 'n1', text: 'Ask Priya about QA' }],
      userActionItems: [{ id: 't1', text: 'Book the demo room' }],
    });
    expect(item.summary).toContain('Shipping Friday.');
  });

  it('indexes words only when the embedding model is not downloaded', async () => {
    getMeetingDetail.mockResolvedValue(meeting('ready'));
    isEmbeddingAvailable.mockResolvedValue(false);
    await searchIndexingService.indexMeeting('m1');
    expect(indexMeeting.mock.calls[0][1]).toEqual({ includeEmbeddings: false });
  });

  it('leaves a meeting that is still recording or processing for its own finish', async () => {
    for (const status of ['recording', 'transcribed', 'summarizing', 'failed']) {
      getMeetingDetail.mockResolvedValue(meeting(status));
      await searchIndexingService.indexMeeting('m1');
    }
    expect(indexMeeting).not.toHaveBeenCalled();
  });
});

describe('meetingEdited (notes and to-dos)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('indexes once after a burst of edits settles', async () => {
    getMeetingDetail.mockResolvedValue(meeting('ready'));
    isEmbeddingAvailable.mockResolvedValue(true);
    searchIndexingService.meetingEdited('m1');
    searchIndexingService.meetingEdited('m1');
    searchIndexingService.meetingEdited('m1');
    expect(getMeetingDetail).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(indexMeeting).toHaveBeenCalledTimes(1);
  });
});
