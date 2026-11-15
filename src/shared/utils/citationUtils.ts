/** Web citation helpers: favicon URLs, domain extraction, deduplication. */

import type { WebCitation, InlineCitationSpan } from '@shared/types';

const FAVICON_BASE = 'https://www.google.com/s2/favicons';
const WWW_PREFIX = /^www\./;

/** Display hostname without the 'www.' prefix, e.g. 'example.com'. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX, '');
  } catch {
    return url;
  }
}

/** Favicon URL from Google's favicon service at the requested size. */
export function getFaviconUrl(url: string, size = 16): string {
  const domain = extractDomain(url);
  return `${FAVICON_BASE}?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Dedupe citations by URL keeping first occurrences; returns the list and an old→new index map. */
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

/** Remap inline citation source indices after deduplication (deduped per span). */
export function remapInlineCitations(
  spans: InlineCitationSpan[],
  indexMap: Map<number, number>
): InlineCitationSpan[] {
  return spans.map(span => ({
    ...span,
    sourceIndices: [...new Set(span.sourceIndices.map(i => indexMap.get(i) ?? i))],
  }));
}
