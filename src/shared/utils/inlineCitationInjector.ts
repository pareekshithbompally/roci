/** Inserts {{cite:N}} tokens at span ends and turns them into <span data-cite> elements for InlineCitationMarker. */

import type { InlineCitationSpan } from '@shared/types';
import { visit } from 'unist-util-visit';
import type { Root, Text, Element, ElementContent } from 'hast';

/** Sentinel token format — must not collide with natural text */
const CITE_TOKEN_RE = /\{\{cite:(\d+(?:,\d+)*)\}\}/g;

// ── Token injection ─────────────────────────────────────────────

/** Fenced and inline code ranges, where citation injection is skipped. */
function findCodeBlockRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  // Fenced code blocks first (triple backtick), then inline code (single backtick)
  const re = /```[\s\S]*?```|`[^`\n]+`/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideCodeBlock(pos: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some(r => pos >= r.start && pos <= r.end);
}

/** Insert {{cite:N}} tokens at span ends, working backward so earlier offsets stay valid. */
export function injectCitationTokens(
  text: string,
  spans: InlineCitationSpan[]
): string {
  if (!spans || spans.length === 0) return text;

  const codeRanges = findCodeBlockRanges(text);

  // Group insertions by endIndex (multiple spans may end at the same position)
  const insertions = new Map<number, Set<number>>();

  for (const span of spans) {
    const end = Math.min(span.endIndex, text.length);
    if (end <= 0) continue;
    if (isInsideCodeBlock(end, codeRanges)) continue;

    const existing = insertions.get(end) || new Set<number>();
    for (const idx of span.sourceIndices) {
      existing.add(idx);
    }
    insertions.set(end, existing);
  }

  // Sort insertion points descending (process from end to preserve offsets)
  const sortedPositions = [...insertions.keys()].sort((a, b) => b - a);

  let result = text;
  for (const pos of sortedPositions) {
    const indices = [...insertions.get(pos)!].sort((a, b) => a - b);
    const token = `{{cite:${indices.join(',')}}}`;
    result = result.slice(0, pos) + token + result.slice(pos);
  }

  return result;
}

// ── Rehype plugin ───────────────────────────────────────────────

/** Rehype plugin turning {{cite:N}} into <span data-cite="N">; runs after sanitization so they are not stripped. */
export function rehypeCitationMarkers() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Element | Root | undefined) => {
      if (!parent || index === undefined) return;

      const text = node.value;
      CITE_TOKEN_RE.lastIndex = 0;
      if (!CITE_TOKEN_RE.test(text)) return;

      // Build replacement children by splitting on citation tokens
      CITE_TOKEN_RE.lastIndex = 0;
      const children: ElementContent[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = CITE_TOKEN_RE.exec(text)) !== null) {
        // Preceding text
        if (match.index > lastIdx) {
          children.push({ type: 'text', value: text.slice(lastIdx, match.index) });
        }

        // Citation element — <span data-cite="0,2">
        children.push({
          type: 'element',
          tagName: 'span',
          properties: { dataCite: match[1] },
          children: [],
        });

        lastIdx = match.index + match[0].length;
      }

      // Trailing text
      if (lastIdx < text.length) {
        children.push({ type: 'text', value: text.slice(lastIdx) });
      }

      // Replace the original text node with the new children
      (parent as Element).children.splice(index, 1, ...children);
    });
  };
}
