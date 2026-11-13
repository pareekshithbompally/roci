import React from 'react';

interface HighlightedTextProps {
  text: string;
  highlight: string;
}

/**
 * HighlightedText Component
 *
 * Highlights matching text segments with a yellow background.
 * Handles case-insensitive matching and escapes special regex characters.
 */
const HighlightedText: React.FC<HighlightedTextProps> = ({ text, highlight }) => {
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
            className="bg-yellow-200 dark:bg-yellow-900 text-paper-950 dark:text-night-100 font-bold px-0.5 rounded"
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

export default HighlightedText;
