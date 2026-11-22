/** Matched words, emphasised one way everywhere: `HighlightedText` finds each word of a search in a title (the words search
 *  matched it by, matchesAllWords); `MarkedExcerpt` shows the words the search index marked in a passage. `mark` tints them
 *  (the iPhone sidebar's results); `strong` sets them stronger (the ⌘K palette). */

import React from 'react';
import { queryWords } from '@shared/utils/textMatch';

interface HighlightedTextProps {
  text: string;
  highlight: string;
  emphasis?: 'mark' | 'strong';
}

const EMPHASIS = {
  mark: 'bg-warning-subtle text-primary font-semibold px-0.5 rounded',
  strong: 'text-primary font-semibold',
} as const;

const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, highlight, emphasis = 'mark' }) => {
  const words = queryWords(highlight);
  if (words.length === 0) return <>{text}</>;
  // Longest first, so "review" wins over "re" where both would match.
  // every word is escaped, so the pattern is only literal alternatives
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const pattern = new RegExp(`(${[...words].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`, 'gi');
  return (
    <span>
      {text.split(pattern).map((part, i) =>
        words.includes(part.toLowerCase()) ? <span key={i} data-match className={EMPHASIS[emphasis]}>{part}</span> : part,
      )}
    </span>
  );
};

/** The search index wraps the words it matched in <<MARK>>…<</MARK>>. */
const MARK_SPLIT = /<<MARK>>|<<\/MARK>>/;

/** A passage from the search index with its matched words emphasised as titles are (`strong`). */
export const MarkedExcerpt: React.FC<{ raw: string }> = ({ raw }) => (
  <>
    {raw.split(MARK_SPLIT).map((part, i) => (i % 2 === 1 ? <span key={i} data-match className={EMPHASIS.strong}>{part}</span> : part))}
  </>
);
