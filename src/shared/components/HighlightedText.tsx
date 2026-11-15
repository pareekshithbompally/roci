import React from 'react';

interface HighlightedTextProps {
  text: string;
  highlight: string;
}

/** Highlights case-insensitive matches of `highlight`, escaping regex characters. */
export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, highlight }) => {
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
          <span
            key={i}
            className="bg-warning-subtle text-primary font-semibold px-0.5 rounded"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
};

