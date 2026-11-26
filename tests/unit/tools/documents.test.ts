/** Asking about documents: find looks passages up (in the library, or one attached file) and cites each document page, a
 *  match by meaning alone included; read gives a document's pages and cites it. */

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
import { SCORE_HIGH, SCORE_MEDIUM } from '@extensions/rag/constants';

const ctx = { approval: 'chat' as const };
const passage = (page: number, chunkText: string, score: number) => ({ path: 'assets/q3.pdf', name: 'Q3 pricing.pdf', chunkText, page, score, kept: true });

beforeEach(() => {
  searchDocuments.mockReset();
  documentPages.mockReset();
});

describe('find in documents', () => {
  it('cites the document and page of a passage found by meaning alone, each page once', async () => {
    const byMeaning = (SCORE_MEDIUM + SCORE_HIGH) / 2;
    searchDocuments.mockResolvedValue([passage(3, 'Priya leads the rollout.', byMeaning), passage(3, 'Acme pilot in August.', byMeaning), passage(9, 'Appendix.', SCORE_MEDIUM / 2)]);
    const out = await findTool.execute({ in: 'documents', query: 'who runs the launch' }, ctx);
    expect(searchDocuments).toHaveBeenCalledWith('who runs the launch', 5, undefined);
    expect(out.content).toContain('"Q3 pricing.pdf", page 3');
    expect(out.content).toContain('Document ID: assets/q3.pdf');
    expect(out.meta?.documentCitations?.map((c) => [c.name, c.page])).toEqual([['Q3 pricing.pdf', 3]]);
  });

  it('searches only the attached file it is given', async () => {
    searchDocuments.mockResolvedValue([]);
    await findTool.execute({ in: 'documents', query: 'price', document: 'assets/att.pdf' }, ctx);
    expect(searchDocuments).toHaveBeenCalledWith('price', 5, ['assets/att.pdf']);
  });
});

describe('read a document', () => {
  it('gives its pages under their numbers and cites it', async () => {
    documentPages.mockResolvedValue({ name: 'Q3 pricing.pdf', pages: ['Tiers.', 'Rollout.'], kept: false });
    const out = await readTool.execute({ document_id: 'assets/q3.pdf', parts: ['summary'] }, ctx);
    expect(out.content).toContain('### Page 1\nTiers.');
    expect(out.content).toContain('### Page 2\nRollout.');
    expect(out.meta?.documentCitations).toMatchObject([{ path: 'assets/q3.pdf', kept: false }]);
  });

  it('says so when the document is gone', async () => {
    documentPages.mockRejectedValue(new Error('No document'));
    const out = await readTool.execute({ document_id: 'assets/gone.pdf', parts: ['summary'] }, ctx);
    expect(out.isError).toBe(true);
  });
});
