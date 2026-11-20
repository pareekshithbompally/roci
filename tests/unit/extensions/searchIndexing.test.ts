import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage, ChatSession, HistoryItem } from '@shared/types';

const db = vi.hoisted(() => ({
  embedded: [] as string[],
  getEmbeddedChunkTexts: vi.fn(async () => db.embedded),
  upsertChunks: vi.fn(),
  upsertMeeting: vi.fn(),
  markMeetingContentIndexed: vi.fn(),
  markMeetingEmbedded: vi.fn(),
  initialize: vi.fn(),
}));
const embedded = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock('@extensions/rag/client', () => ({ vectorDB: db }));
vi.mock('@services/localModels.service', () => ({ getLocalModels: async () => [] }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  embedMany: async ({ values }: { values: string[] }) => {
    embedded.texts.push(...values);
    return { embeddings: values.map(() => [0.5]) };
  },
}));

import { ragIndexer } from '@extensions/rag/indexer';
import { chunkChatSession } from '@extensions/rag/chat-chunker';
import { chunkMeeting } from '@extensions/rag/chunker';

const meeting: HistoryItem = {
  id: 'm1', title: 'Weekly sync', timestamp: 0, categories: [], transcript: 'We ship on Friday. The budget is fine.',
  summary: 'Shipping and budget.', userNotes: [{ id: 'n', text: 'Ask about the launch date', timestamp: 0 }], userActionItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  embedded.texts = [];
});

describe('meeting index saves', () => {
  it('embeds only the pieces without a vector: a note edit embeds the notes piece, not the transcript', async () => {
    const edited = { ...meeting, userNotes: [{ id: 'n', text: 'Ask about the launch date and the venue', timestamp: 0 }] };
    db.embedded = chunkMeeting(meeting).map((c) => c.text);
    await ragIndexer.indexMeeting(edited);
    expect(embedded.texts).toEqual(['Ask about the launch date and the venue']);
    expect(db.markMeetingEmbedded).toHaveBeenCalledWith('m1');
  });
});

describe('chat turns', () => {
  it('splits a long answer at sentences so all of it is searchable, each piece with its question', () => {
    const sentence = 'This is one sentence of a long and detailed answer. ';
    const answer = sentence.repeat(60).trim();
    const messages: ChatMessage[] = [
      { id: 'q', role: 'user', text: 'Tell me everything', timestamp: 0 },
      { id: 'a', role: 'model', text: answer, timestamp: 0 },
    ];
    const turns = chunkChatSession({ id: 's', title: 't', lastMessageAt: 0, messages } as ChatSession);
    expect(turns.length).toBeGreaterThan(1);
    expect(turns.every((t) => t.text.startsWith('User: Tell me everything\nAssistant: '))).toBe(true);
    expect(turns.at(-1)!.text.endsWith('detailed answer.')).toBe(true);
  });
});
