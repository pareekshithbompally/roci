import { describe, it, expect } from 'vitest';
import * as rag from '@extensions/rag';
import { ragIndexer } from '@extensions/rag';

describe('RAG module has no knowledge-graph surface', () => {
  it('exports no graph client or extractor', () => {
    expect('graphDB' in rag).toBe(false);
    expect('entityExtractor' in rag).toBe(false);
  });

  it('indexer has no extractAll', () => {
    expect('extractAll' in ragIndexer).toBe(false);
  });
});
