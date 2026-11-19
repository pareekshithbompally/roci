import React from 'react';

interface HighlightedTextProps {
  text: string;
  highlight: string;
  /** `mark`: a tinted highlight (sidebar search); `strong`: the matched words stronger, as a command palette shows them. */
  emphasis?: 'mark' | 'strong';
}

const EMPHASIS = {
  mark: 'bg-warning-subtle text-primary font-semibold px-0.5 rounded',
  strong: 'text-primary font-semibold',
} as const;

/** Highlights case-insensitive matches of `highlight`, escaping regex characters. */
export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, highlight, emphasis = 'mark' }) => {
  // No highlight - return plain text
  if (!highlight || !highlight.trim()) {
    return <>{text}</>;
  }

  // Escape special regex characters to prevent crashes
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Split text by highlight matches (case-insensitive)
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className={EMPHASIS[emphasis]}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
};

