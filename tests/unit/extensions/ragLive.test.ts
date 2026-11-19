import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => ({ appendChunks: vi.fn(), search: vi.fn(), initialize: vi.fn() }));
const embed = vi.hoisted(() => ({ embedDocuments: vi.fn(), embedQueries: vi.fn(), isEmbeddingMissing: vi.fn() }));
vi.mock('@extensions/rag/client', () => ({ vectorDB: store }));
vi.mock('@extensions/rag/embeddings', () => embed);

import { ragIndexer } from '@extensions/rag/indexer';
import { ragSearcher } from '@extensions/rag/searcher';

const hit = (text: string) => ({ meeting_id: 'm1', meeting_title: 'Sync', chunk_text: text, chunk_type: 'transcript', score: 1, created_at: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  embed.isEmbeddingMissing.mockReturnValue(false);
  store.search.mockImplementation(async ({ query_text }: { query_text: string }) => [hit(`about ${query_text}`)]);
});

describe('ragIndexer.appendTranscript', () => {
  it('chunks and embeds a stretch as the whole meeting is, and appends it', async () => {
    embed.embedDocuments.mockResolvedValue([[0.1, 0.2]]);
    await expect(ragIndexer.appendTranscript('m1', '[00:10] You: The budget is ten thousand.')).resolves.toEqual(['[00:10] You: The budget is ten thousand.']);
    expect(store.appendChunks).toHaveBeenCalledWith('m1', [
      expect.objectContaining({ chunk_text: '[00:10] You: The budget is ten thousand.', chunk_type: 'transcript', embedding: [0.1, 0.2] }),
    ]);
  });

  it('without the embedding model the stretch is still appended, for full-text search', async () => {
    embed.embedDocuments.mockRejectedValue({ code: 'not-downloaded' });
    embed.isEmbeddingMissing.mockReturnValue(true);
    await ragIndexer.appendTranscript('m1', 'Ship on Friday.');
    expect(store.appendChunks).toHaveBeenCalledWith('m1', [expect.objectContaining({ chunk_text: 'Ship on Friday.', embedding: undefined })]);
  });

  it('an empty stretch adds nothing', async () => {
    await expect(ragIndexer.appendTranscript('m1', '   ')).resolves.toEqual([]);
    expect(store.appendChunks).not.toHaveBeenCalled();
  });
});

describe('ragSearcher.searchWithin', () => {
  it('embeds every query in one call and searches each within the meeting', async () => {
    embed.embedQueries.mockResolvedValue([[1], [2]]);
    const results = await ragSearcher.searchWithin('m1', ['budget', 'hiring'], 3);
    expect(embed.embedQueries).toHaveBeenCalledTimes(1);
    expect(store.search).toHaveBeenCalledWith(expect.objectContaining({ query_text: 'budget', embedding: [1], meeting_ids: ['m1'], limit: 3, mode: 'hybrid' }));
    expect(results.map((r) => r.map((h) => h.chunkText))).toEqual([['about budget'], ['about hiring']]);
  });

  it('falls back to full-text when the embedding model is missing', async () => {
    embed.embedQueries.mockRejectedValue({ code: 'not-downloaded' });
    embed.isEmbeddingMissing.mockReturnValue(true);
    await ragSearcher.searchWithin('m1', ['budget'], 3);
    expect(store.search).toHaveBeenCalledWith(expect.objectContaining({ embedding: [], mode: 'fulltext' }));
  });
});
