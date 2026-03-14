# Phase 1: New Types & Utility Functions

## Overview

Add `WebCitation` and `InlineCitationSpan` types, extend `StreamMetadata`, add fields to `ChatMessage` (both app and storage layers), and create a `citationUtils.ts` utility module.

---

## 1.1 — Extend `services/adapters/types.ts`

**File:** `services/adapters/types.ts`

### Add WebCitation and InlineCitationSpan (after line 17)

```typescript
/** A citation from a web search result */
export interface WebCitation {
  url: string;
  title: string;
  /** Short excerpt from the cited page (provider-dependent) */
  snippet?: string;
}

/** Maps a span of response text to its web citation sources */
export interface InlineCitationSpan {
  /** Character offset — start of the cited span in the completed text */
  startIndex: number;
  /** Character offset — end of the cited span */
  endIndex: number;
  /** Indexes into the parent message's webCitations[] array */
  sourceIndices: number[];
}
```

### Extend StreamMetadata (lines 12-17)

Add two optional fields:

```typescript
export interface StreamMetadata {
  isThinking?: boolean;
  isSearching?: boolean;
  searchQuery?: string;
  thinkingContent?: string;
  /** Web citations extracted from provider response (typically on final chunk) */
  webCitations?: WebCitation[];
  /** Inline citation spans mapping text ranges to source indices */
  inlineCitations?: InlineCitationSpan[];
}
```

### Verification
- TypeScript compiles with no errors
- Existing adapter code still works (new fields are optional)
- `StreamCallbacks.onChunk` signature unchanged — metadata is still `StreamMetadata | undefined`

---

## 1.2 — Extend `types.ts` (App ChatMessage)

**File:** `types.ts`

### Add imports (after line 2)

```typescript
import type { WebCitation, InlineCitationSpan } from './services/adapters/types';
export type { WebCitation, InlineCitationSpan };
```

### Add fields to ChatMessage (after line 103, before the closing `}`)

```typescript
export interface ChatMessage {
  // ... existing fields ...

  /** Web search citations attached to this response */
  webCitations?: WebCitation[];
  /** Inline citation spans (char offsets → webCitations indices) */
  inlineCitations?: InlineCitationSpan[];
}
```

The full `ChatMessage` becomes (showing only the delta):

```diff
 export interface ChatMessage {
   id: string;
   role: 'user' | 'model';
   text: string;
   parts?: ChatPart[];
   timestamp: number;
   suggestions?: string[];
   provider?: string;
   model?: string;
   state?: 'loading' | 'streaming' | 'complete';
   tokenCount?: number;
   tokensPerSecond?: number;
   toolActivity?: {
     calls: Array<{
       toolName: string;
       executionMs: number;
       resultSummary?: string;
     }>;
     totalIterations: number;
     citations?: MeetingCitation[];
   };
+  /** Web search citations attached to this response */
+  webCitations?: WebCitation[];
+  /** Inline citation spans (char offsets → webCitations indices) */
+  inlineCitations?: InlineCitationSpan[];
 }
```

### Verification
- Import `WebCitation` and `InlineCitationSpan` resolves correctly via the path alias
- No existing code breaks (fields are optional)

---

## 1.3 — Extend `services/storage/types.ts` (Storage ChatMessage)

**File:** `services/storage/types.ts`

### Add fields to storage ChatMessage (after line 71)

```diff
 export interface ChatMessage {
   id: string;
   role: 'user' | 'assistant' | 'system';
   content: string;
   parts?: import('../../types').ChatPart[];
   timestamp: string;
   provider?: string;
   model?: string;
   suggestions?: string[];
   tokenCount?: number;
   tokensPerSecond?: number;
   toolActivity?: import('../../types').ChatMessage['toolActivity'];
+  webCitations?: import('../../types').WebCitation[];
+  inlineCitations?: import('../../types').InlineCitationSpan[];
 }
```

Uses the same `import('...')` pattern already used by `toolActivity` and `parts`.

### Verification
- `fromStoredMessage()` and `toStoredMessage()` in `ChatContext.tsx` will passthrough the new fields (we handle that in Phase 3)
- JSON serialization/deserialization works automatically for these plain objects

---

## 1.4 — Create `src/shared/utils/citationUtils.ts` (NEW)

**File:** `src/shared/utils/citationUtils.ts`

```typescript
/**
 * Citation Utilities
 *
 * Helpers for web citation display: favicon URLs, domain extraction, deduplication.
 */

import type { WebCitation } from '@/types';

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
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Get a favicon URL for a given website URL.
 * Uses Google's favicon service which reliably returns 16x16 favicons.
 *
 * @example
 * getFaviconUrl('https://docs.python.org/3/') // 'https://www.google.com/s2/favicons?domain=docs.python.org&sz=16'
 */
export function getFaviconUrl(url: string, size: number = 16): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Deduplicate web citations by URL.
 * When duplicates exist, keeps the first occurrence (preserving order).
 * Returns a new array and a mapping from old indices to new indices.
 *
 * @returns { citations: deduped array, indexMap: Map<oldIndex, newIndex> }
 */
export function deduplicateCitations(
  citations: WebCitation[]
): { citations: WebCitation[]; indexMap: Map<number, number> } {
  const seen = new Map<string, number>(); // url → new index
  const deduped: WebCitation[] = [];
  const indexMap = new Map<number, number>();

  for (let i = 0; i < citations.length; i++) {
    const url = citations[i].url;
    if (seen.has(url)) {
      indexMap.set(i, seen.get(url)!);
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
 * Updates sourceIndices in-place using the indexMap from deduplicateCitations.
 */
export function remapInlineCitations(
  spans: Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }>,
  indexMap: Map<number, number>
): Array<{ startIndex: number; endIndex: number; sourceIndices: number[] }> {
  return spans.map(span => ({
    ...span,
    sourceIndices: [...new Set(span.sourceIndices.map(i => indexMap.get(i) ?? i))],
  }));
}
```

### Verification
- `extractDomain` handles edge cases: malformed URLs return the raw string, `www.` prefix stripped
- `getFaviconUrl` produces correct Google S2 URLs
- `deduplicateCitations` preserves order, returns correct index mapping
- `remapInlineCitations` handles missing indices gracefully (identity fallback)

---

## Phase 1 Checklist

- [ ] `WebCitation` and `InlineCitationSpan` added to `services/adapters/types.ts`
- [ ] `StreamMetadata` extended with `webCitations?` and `inlineCitations?`
- [ ] App `ChatMessage` in `types.ts` extended with `webCitations?` and `inlineCitations?`
- [ ] Storage `ChatMessage` in `services/storage/types.ts` extended with same fields
- [ ] `src/shared/utils/citationUtils.ts` created with `extractDomain`, `getFaviconUrl`, `deduplicateCitations`, `remapInlineCitations`
- [ ] Re-exports added in `types.ts` for `WebCitation` and `InlineCitationSpan`
- [ ] TypeScript compiles cleanly
