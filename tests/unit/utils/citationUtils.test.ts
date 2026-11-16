import { describe, it, expect } from 'vitest';
import {
  extractDomain,
  getFaviconUrl,
  describeCitation,
  deduplicateCitations,
  remapInlineCitations,
} from '@shared/utils/citationUtils';

import type { WebCitation, InlineCitationSpan } from '@shared/types';

// ── extractDomain ───────────────────────────────────────────────

describe('extractDomain', () => {
  it('strips www. prefix', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
  });

  it('handles https URLs', () => {
    expect(extractDomain('https://docs.rust-lang.org/book/')).toBe('docs.rust-lang.org');
  });

  it('handles http URLs', () => {
    expect(extractDomain('http://example.com')).toBe('example.com');
  });

  it('preserves subdomains other than www', () => {
    expect(extractDomain('https://api.github.com/repos')).toBe('api.github.com');
  });

  it('returns the raw string for an invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });

  it('returns empty string for an empty string', () => {
    expect(extractDomain('')).toBe('');
  });

  it('handles URL with port', () => {
    expect(extractDomain('https://localhost:3000/api')).toBe('localhost');
  });

  it('handles URL with auth', () => {
    expect(extractDomain('https://user:pass@www.example.com')).toBe('example.com');
  });

  it('strips www. only at start of hostname', () => {
    // subdomain like "www2.example.com" should be kept
    expect(extractDomain('https://www2.example.com')).toBe('www2.example.com');
  });
});

// ── getFaviconUrl ───────────────────────────────────────────────

describe('getFaviconUrl', () => {
  it('returns correct format with default size', () => {
    const result = getFaviconUrl('https://example.com');
    expect(result).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=16'
    );
  });

  it('uses custom size parameter', () => {
    const result = getFaviconUrl('https://example.com', 32);
    expect(result).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=32'
    );
  });

  it('encodes domain with special characters', () => {
    const result = getFaviconUrl('https://exämple.com');
    expect(result).toContain('domain=');
    expect(result).toContain('&sz=16');
  });

  it('strips www. from domain in favicon URL', () => {
    const result = getFaviconUrl('https://www.github.com');
    expect(result).toContain('domain=github.com');
  });

  it('handles invalid URL gracefully', () => {
    const result = getFaviconUrl('not-a-url');
    expect(result).toBe(
      'https://www.google.com/s2/favicons?domain=not-a-url&sz=16'
    );
  });
});

// ── deduplicateCitations ────────────────────────────────────────

describe('deduplicateCitations', () => {
  const makeCitation = (url: string, title = 'Title'): WebCitation =>
    ({ url, title } as WebCitation);

  it('returns unchanged array when no duplicates', () => {
    const input = [makeCitation('https://a.com'), makeCitation('https://b.com')];
    const { citations, indexMap } = deduplicateCitations(input);

    expect(citations).toHaveLength(2);
    expect(indexMap.get(0)).toBe(0);
    expect(indexMap.get(1)).toBe(1);
  });

  it('removes duplicates keeping the first occurrence', () => {
    const input = [
      makeCitation('https://a.com', 'First'),
      makeCitation('https://b.com'),
      makeCitation('https://a.com', 'Duplicate'),
    ];
    const { citations } = deduplicateCitations(input);

    expect(citations).toHaveLength(2);
    expect(citations[0].title).toBe('First');
    expect(citations[1].url).toBe('https://b.com');
  });

  it('maps duplicate indices to the first occurrence index', () => {
    const input = [
      makeCitation('https://a.com'),
      makeCitation('https://b.com'),
      makeCitation('https://a.com'),
      makeCitation('https://b.com'),
    ];
    const { indexMap } = deduplicateCitations(input);

    expect(indexMap.get(0)).toBe(0);
    expect(indexMap.get(1)).toBe(1);
    expect(indexMap.get(2)).toBe(0); // duplicate of index 0
    expect(indexMap.get(3)).toBe(1); // duplicate of index 1
  });

  it('handles empty array', () => {
    const { citations, indexMap } = deduplicateCitations([]);
    expect(citations).toHaveLength(0);
    expect(indexMap.size).toBe(0);
  });

  it('handles single citation', () => {
    const { citations, indexMap } = deduplicateCitations([makeCitation('https://a.com')]);
    expect(citations).toHaveLength(1);
    expect(indexMap.get(0)).toBe(0);
  });

  it('handles all duplicates of the same URL', () => {
    const input = [
      makeCitation('https://a.com', 'A1'),
      makeCitation('https://a.com', 'A2'),
      makeCitation('https://a.com', 'A3'),
    ];
    const { citations, indexMap } = deduplicateCitations(input);

    expect(citations).toHaveLength(1);
    expect(citations[0].title).toBe('A1');
    expect(indexMap.get(0)).toBe(0);
    expect(indexMap.get(1)).toBe(0);
    expect(indexMap.get(2)).toBe(0);
  });
});

// ── remapInlineCitations ────────────────────────────────────────

describe('remapInlineCitations', () => {
  const makeSpan = (
    startIndex: number,
    endIndex: number,
    sourceIndices: number[]
  ): InlineCitationSpan => ({ startIndex, endIndex, sourceIndices } as InlineCitationSpan);

  it('remaps indices using the provided map', () => {
    const spans = [makeSpan(0, 10, [0, 2])];
    const indexMap = new Map([
      [0, 0],
      [2, 1],
    ]);
    const result = remapInlineCitations(spans, indexMap);

    expect(result[0].sourceIndices).toEqual([0, 1]);
  });

  it('deduplicates sourceIndices after remapping', () => {
    // Both 0 and 2 map to the same new index 0
    const spans = [makeSpan(0, 10, [0, 2])];
    const indexMap = new Map([
      [0, 0],
      [2, 0],
    ]);
    const result = remapInlineCitations(spans, indexMap);

    expect(result[0].sourceIndices).toEqual([0]);
  });

  it('preserves spans when no remapping is needed', () => {
    const spans = [makeSpan(5, 15, [0, 1])];
    const indexMap = new Map([
      [0, 0],
      [1, 1],
    ]);
    const result = remapInlineCitations(spans, indexMap);

    expect(result[0]).toEqual({ startIndex: 5, endIndex: 15, sourceIndices: [0, 1] });
  });

  it('falls back to original index when not in map', () => {
    const spans = [makeSpan(0, 10, [5])];
    const indexMap = new Map<number, number>(); // empty map
    const result = remapInlineCitations(spans, indexMap);

    expect(result[0].sourceIndices).toEqual([5]);
  });

  it('handles empty spans array', () => {
    const result = remapInlineCitations([], new Map());
    expect(result).toEqual([]);
  });

  it('does not mutate original spans', () => {
    const original = [makeSpan(0, 10, [0, 1])];
    const indexMap = new Map([
      [0, 5],
      [1, 6],
    ]);
    remapInlineCitations(original, indexMap);

    expect(original[0].sourceIndices).toEqual([0, 1]);
  });
});

// ── describeCitation ────────────────────────────────────────────

describe('describeCitation', () => {
  it('shows a titled source as title over site', () => {
    expect(describeCitation({ url: 'https://www.nature.com/articles/x', title: 'A study' }))
      .toEqual({ name: 'A study', site: 'nature.com', detail: 'nature.com' });
  });

  it('tells untitled pages of one site apart by path', () => {
    expect(describeCitation({ url: 'https://www.humanbaseline.org/benchmarks/?utm_source=openai', title: '' }))
      .toEqual({ name: 'humanbaseline.org', site: 'humanbaseline.org', detail: '/benchmarks' });
  });

  it('gives an untitled home page no detail line', () => {
    expect(describeCitation({ url: 'https://www.humanbaseline.org/', title: '' }).detail).toBeNull();
  });

  it('reads the real site of a Gemini search redirect from its title', () => {
    expect(describeCitation({ url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'mit.edu' }))
      .toEqual({ name: 'mit.edu', site: 'mit.edu', detail: null });
  });
});
