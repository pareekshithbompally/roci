/** Asking about documents: find looks passages up (in the library, or one attached file) and cites the best few pages;
 *  one attached file with nothing indexed yet is read instead; read gives a document's pages, saying when some are cut. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchDocuments = vi.hoisted(() => vi.fn());
const documentPages = vi.hoisted(() => vi.fn());
vi.mock('@extensions/rag/searchIndex', () => ({ searchDocuments, documentPages, searchMeetings: vi.fn(), searchChats: vi.fn() }));
vi.mock('@extensions/rag', () => ({ indexStretch: vi.fn(async () => []) }));
vi.mock('@services/storage', () => ({ documentsService: { list: vi.fn(async () => []) } }));

// eslint-disable-next-line import/first
import { findTool } from '@extensions/tools/definitions/find.tool';
// eslint-disable-next-line import/first
import { readTool } from '@extensions/tools/definitions/read.tool';
// eslint-disable-next-line import/first
import { MAX_DOCUMENT_FOR_LLM } from '@extensions/tools/constants';

const ctx = { approval: 'chat' as const };
const passage = (page: number, chunkText: string, score: number) => ({ path: 'assets/q3.pdf', name: 'Q3 pricing.pdf', chunkText, page, score });

beforeEach(() => {
  searchDocuments.mockReset();
  documentPages.mockReset();
});

describe('find in documents', () => {
  it('cites each document page the passages it found are on, once', async () => {
    searchDocuments.mockResolvedValue([passage(3, 'Priya leads the rollout.', 0.02), passage(3, 'Acme pilot in August.', 0.018), passage(9, 'Rollout dates.', 0.015)]);
    const out = await findTool.execute({ in: 'documents', query: 'who runs the launch' }, ctx);
    expect(searchDocuments).toHaveBeenCalledWith('who runs the launch', 5, undefined);
    expect(out.content).toContain('"Q3 pricing.pdf", page 3');
    expect(out.content).toContain('Document ID: assets/q3.pdf');
    expect(out.meta?.documentCitations?.map((c) => c.page)).toEqual([3, 9]);
  });

  it('reads an attached file whose index has nothing yet, instead of saying it holds nothing', async () => {
    searchDocuments.mockResolvedValue([]);
    documentPages.mockResolvedValue({ name: 'Draft.pdf', pages: ['Priya leads it.'] });
    const out = await findTool.execute({ in: 'documents', query: 'who', document: 'assets/att.pdf' }, ctx);
    expect(out.content).toContain('Priya leads it.');
    expect(out.meta?.documentCitations).toMatchObject([{ path: 'assets/att.pdf' }]);
  });

  it('searches only the attached file it is given', async () => {
    searchDocuments.mockResolvedValue([]);
    await findTool.execute({ in: 'documents', query: 'price', document: 'assets/att.pdf' }, ctx);
    expect(searchDocuments).toHaveBeenCalledWith('price', 5, ['assets/att.pdf']);
  });
});

describe('read a document', () => {
  it('gives its pages under their numbers and cites it', async () => {
    documentPages.mockResolvedValue({ name: 'Q3 pricing.pdf', pages: ['Tiers.', 'Rollout.'] });
    const out = await readTool.execute({ document_id: 'assets/q3.pdf', parts: ['summary'] }, ctx);
    expect(out.content).toContain('### Page 1\nTiers.');
    expect(out.content).toContain('### Page 2\nRollout.');
    expect(out.meta?.documentCitations).toMatchObject([{ path: 'assets/q3.pdf' }]);
  });

  it('says when a long text file was cut', async () => {
    documentPages.mockResolvedValue({ name: 'log.txt', pages: ['x'.repeat(MAX_DOCUMENT_FOR_LLM + 10)] });
    const out = await readTool.execute({ document_id: 'assets/log.txt', parts: ['summary'] }, ctx);
    expect(out.content).toContain('Not all of it is shown');
  });

  it('says so when the document is gone', async () => {
    documentPages.mockRejectedValue(new Error('No document'));
    const out = await readTool.execute({ document_id: 'assets/gone.pdf', parts: ['summary'] }, ctx);
    expect(out.isError).toBe(true);
  });
});
