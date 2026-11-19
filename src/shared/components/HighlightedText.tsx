/** Text with each word of a search emphasised wherever it appears, in any order — the words search matched it by
 *  (matchesAllWords). `mark` tints them (the iPhone sidebar's results); `strong` sets them stronger (the ⌘K palette). */

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
  const pattern = new RegExp(`(${[...words].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`, 'gi');
  return (
    <span>
      {text.split(pattern).map((part, i) =>
        words.includes(part.toLowerCase()) ? <span key={i} data-match className={EMPHASIS[emphasis]}>{part}</span> : part,
      )}
    </span>
  );
};
