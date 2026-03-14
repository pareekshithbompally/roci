# Phase 5: Inline Citation Markers in Markdown

## Overview

When providers return inline citation spans (Gemini and OpenAI), we inject superscript citation markers like `[1]` into the completed markdown text. These markers are clickable and show which source backs a specific claim.

**Important:** Inline markers are only injected into **completed** text — never during streaming. This avoids complex offset tracking during incremental text arrival.

---

## 5.1 — Create `InlineCitationMarker` Component

**File:** `src/features/chat/components/InlineCitationMarker.tsx` (NEW)

```typescript
/**
 * InlineCitationMarker
 *
 * A superscript badge that links to a web citation source.
 * Rendered inline within markdown text after completion.
 *
 * Visual: a small pill with the citation number, e.g. [1]
 * On hover: shows source URL tooltip
 * On click: opens source URL in new tab
 */

import React from 'react';
import { getFaviconUrl } from '@shared/utils/citationUtils';
import type { WebCitation } from '@/types';

interface InlineCitationMarkerProps {
  /** 1-based citation number for display */
  index: number;
  /** The citation data */
  citation: WebCitation;
}

export const InlineCitationMarker: React.FC<InlineCitationMarkerProps> = ({
  index,
  citation,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(citation.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-0.5 align-super mx-0.5 px-1 py-0 text-[10px] font-medium
                 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                 border border-blue-200/60 dark:border-blue-800/40 rounded
                 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer
                 no-underline leading-none"
      title={citation.url}
      aria-label={`Source ${index}: ${citation.title || citation.url}`}
    >
      <img
        src={getFaviconUrl(citation.url, 12)}
        alt=""
        className="w-2.5 h-2.5 rounded-sm"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <span>{index}</span>
    </button>
  );
};

export default InlineCitationMarker;
```

### Design decisions:
- **10px font** in `align-super` — small enough to not disrupt reading flow
- **Blue tint** to distinguish from regular text (consistent with link color)
- **Favicon + number** — e.g., `[🌐 1]` — gives visual context about the source
- **`stopPropagation`** — prevents the click from bubbling to parent handlers
- **`no-underline`** — prevents markdown link styling from affecting the marker

---

## 5.2 — Create `inlineCitationInjector` Utility

**File:** `src/shared/utils/inlineCitationInjector.ts` (NEW)

This utility transforms completed text by inserting citation marker placeholders at the correct positions. It works with the `InlineCitationSpan[]` array from the message.

```typescript
/**
 * Inline Citation Injector
 *
 * Post-processes completed response text to insert citation marker tokens
 * at positions defined by InlineCitationSpan[].
 *
 * Strategy: convert character-offset spans into marker insertions at endIndex
 * positions, working from the end of the string backward to preserve offsets.
 *
 * Output: the original text with `{{cite:N}}` tokens inserted, where N is
 * a 1-based source index. The markdown renderer replaces these tokens with
 * <InlineCitationMarker> React components.
 */

import type { InlineCitationSpan, WebCitation } from '@/types';

/** Sentinel token format — must not collide with natural text */
const CITE_TOKEN_RE = /\{\{cite:(\d+(?:,\d+)*)\}\}/g;

/**
 * Inject citation tokens into completed text.
 *
 * @param text — The completed response text
 * @param spans — Inline citation spans from the message
 * @returns Text with {{cite:N}} tokens inserted at span boundaries
 */
export function injectCitationTokens(
  text: string,
  spans: InlineCitationSpan[]
): string {
  if (!spans || spans.length === 0) return text;

  // Group insertions by endIndex (multiple spans may end at the same position)
  const insertions = new Map<number, Set<number>>(); // endIndex → set of sourceIndices

  for (const span of spans) {
    // Clamp indices to text bounds
    const end = Math.min(span.endIndex, text.length);
    if (end <= 0) continue;

    const existing = insertions.get(end) || new Set<number>();
    for (const idx of span.sourceIndices) {
      existing.add(idx);
    }
    insertions.set(end, existing);
  }

  // Sort insertion points in descending order (process from end to preserve offsets)
  const sortedPositions = [...insertions.keys()].sort((a, b) => b - a);

  let result = text;
  for (const pos of sortedPositions) {
    const indices = [...insertions.get(pos)!].sort((a, b) => a - b);
    // Create token: {{cite:0,2,3}} — 0-based indices, comma-separated
    const token = `{{cite:${indices.join(',')}}}`;
    result = result.slice(0, pos) + token + result.slice(pos);
  }

  return result;
}

/**
 * Parse citation tokens from text for rendering.
 * Returns an array of segments: either plain text or citation markers.
 *
 * @param text — Text containing {{cite:N}} tokens
 * @returns Array of segments for rendering
 */
export interface TextSegment {
  type: 'text';
  content: string;
}

export interface CitationSegment {
  type: 'citation';
  /** 0-based source indices */
  sourceIndices: number[];
}

export type ContentSegment = TextSegment | CitationSegment;

export function parseCitationTokens(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  CITE_TOKEN_RE.lastIndex = 0; // Reset regex state
  let match: RegExpExecArray | null;

  while ((match = CITE_TOKEN_RE.exec(text)) !== null) {
    // Add preceding text
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    // Parse source indices
    const indices = match[1].split(',').map(Number);
    segments.push({ type: 'citation', sourceIndices: indices });

    lastIndex = match.index + match[0].length;
  }

  // Add trailing text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Check if text contains any citation tokens.
 */
export function hasCitationTokens(text: string): boolean {
  CITE_TOKEN_RE.lastIndex = 0;
  return CITE_TOKEN_RE.test(text);
}
```

---

## 5.3 — Integration Point: StreamingMarkdown / CompletedContent

**File:** `src/features/chat/components/ChatMessage.tsx`

### Option A: Inject before rendering (recommended)

In `CompletedContent`, inject citation tokens into the text before passing to `StreamingMarkdown`:

```typescript
import { injectCitationTokens } from '@shared/utils/inlineCitationInjector';

const CompletedContent: React.FC<{
  text: string;
  parts?: ChatPart[];
  messageId: string;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}> = ({ text, parts, messageId, webCitations, inlineCitations }) => {
  // Inject inline citation tokens into completed text
  const processedText = useMemo(() => {
    if (!inlineCitations || inlineCitations.length === 0 || !webCitations || webCitations.length === 0) {
      return text;
    }
    return injectCitationTokens(text, inlineCitations);
  }, [text, inlineCitations, webCitations]);

  if (parts && parts.length > 0) {
    return (
      <>
        {parts.map((part, index) => {
          if (part.type === 'text') {
            if (!part.text) return null;
            const processed = inlineCitations && webCitations
              ? injectCitationTokens(part.text, inlineCitations)
              : part.text;
            return (
              <StreamingMarkdown key={index} content={processed} streaming={false} messageId={messageId} />
            );
          }
          return <MediaPartRenderer key={index} part={part} />;
        })}
      </>
    );
  }

  return <StreamingMarkdown content={processedText} streaming={false} messageId={messageId} />;
};
```

### Option B: Custom markdown component for citations (alternative)

Register a custom component in the Streamdown renderer that recognizes `{{cite:N}}` patterns and renders `<InlineCitationMarker>`. This approach integrates deeper with the markdown pipeline but is more complex.

**Recommendation:** Start with Option A. If the token pattern causes issues with markdown parsing (e.g., inside code blocks), move to Option B.

---

## 5.4 — CSS for Inline Markers

**File:** `src/styles/markdown.css`

Add styles to ensure citation markers don't break markdown layout:

```css
/* Inline citation markers within markdown content */
.markdown-content button[aria-label^="Source"] {
  vertical-align: super;
  font-size: 10px;
  line-height: 1;
  text-decoration: none;
}
```

---

## 5.5 — Edge Cases

### Code blocks
Citation tokens inside code blocks (```` ``` ````) should NOT be rendered as markers. The `injectCitationTokens` function should skip insertions that fall within code block ranges.

```typescript
// Enhancement: detect code block boundaries before injection
function findCodeBlockRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const codeBlockRe = /```[\s\S]*?```|`[^`\n]+`/g;
  let match;
  while ((match = codeBlockRe.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

// In injectCitationTokens, skip insertions inside code blocks:
const codeRanges = findCodeBlockRanges(text);
// ... filter insertions that fall within codeRanges ...
```

### Missing webCitations array
If `inlineCitations` exists but `webCitations` is empty/undefined, skip injection entirely.

### Overlapping spans
Multiple spans may reference the same text range. The injector merges them into a single token with multiple source indices: `{{cite:0,2,3}}`.

---

## Phase 5 Checklist

- [ ] `InlineCitationMarker.tsx` created with favicon + number badge
- [ ] `inlineCitationInjector.ts` created with `injectCitationTokens`, `parseCitationTokens`
- [ ] `CompletedContent` processes text through injection before rendering
- [ ] Citation tokens survive markdown rendering (not parsed as markdown syntax)
- [ ] Markers don't appear during streaming (only on completed text)
- [ ] Code blocks are not affected by citation injection
- [ ] Clicking a marker opens the source URL in a new tab
- [ ] Hover tooltip shows the full URL
- [ ] Visual: small, non-disruptive blue pills with favicon
