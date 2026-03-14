/**
 * Citation Utilities
 *
 * Helpers for web citation display: favicon URLs, domain extraction, deduplication.
 */

import type { WebCitation, InlineCitationSpan } from '@/types';

const FAVICON_BASE = 'https://www.google.com/s2/favicons';
const WWW_PREFIX = /^www\./;

/**
 * Extract the domain from a URL for display purposes.
 * Returns the hostname without 'www.' prefix.
 *
 * @example
 * extractDomain('https://www.example.com/path') // 'example.com'
 * extractDomain('https://docs.rust-lang.org/book/') // 'docs.rust-lang.org'
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, '');
  } catch {
    return url;
  }
}

/**
 * Get a favicon URL for a given website URL.
 * Uses Google's favicon service which reliably returns favicons at the requested size.
 */
export function getFaviconUrl(url: string, size = 16): string {
  const domain = extractDomain(url);
  return `${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Deduplicate web citations by URL.
 * Keeps the first occurrence (preserving order).
 *
 * @returns Deduped array and a mapping from old indices to new indices.
 */
export function deduplicateCitations(
  citations: WebCitation[]
): { citations: WebCitation[]; indexMap: Map<number, number> } {
  const seen = new Map<string, number>();
  const deduped: WebCitation[] = [];
  const indexMap = new Map<number, number>();

  for (let i = 0; i < citations.length; i++) {
    const { url } = citations[i];
    const existing = seen.get(url);

    if (existing !== undefined) {
      indexMap.set(i, existing);
    } else {
      const newIdx = deduped.length;
      seen.set(url, newIdx);
      indexMap.set(i, newIdx);
      deduped.push(citations[i]);
    }
  }

  return { citations: deduped, indexMap };
}

/**
 * Remap inline citation source indices after deduplication.
 * Returns a new array with updated sourceIndices (deduped per span).
 */
export function remapInlineCitations(
  spans: InlineCitationSpan[],
  indexMap: Map<number, number>
): InlineCitationSpan[] {
  return spans.map(span => ({
    ...span,
    sourceIndices: [...new Set(span.sourceIndices.map(i => indexMap.get(i) ?? i))],
  }));
}
