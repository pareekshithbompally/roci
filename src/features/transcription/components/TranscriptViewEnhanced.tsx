import React from 'react';
import ParsedTranscript from '@features/transcription/components/ParsedTranscript';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface TranscriptViewProps {
  text?: string;
  timestamp?: number;
  title?: string;
}

/**
 * TranscriptView Component
 *
 * Displays transcript with:
 * - Consistent timestamp formatting
 * - Clean content presentation
 */
const TranscriptView: React.FC<TranscriptViewProps> = ({
  text,
}) => {
  // Safety check for text prop
  if (!text) {
    return (
      <div className="max-w-4xl">
        <div className="p-8 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <p className={`${TYPOGRAPHY_CLASSES.transcriptText} text-zinc-500 dark:text-zinc-400 text-center`}>
            No transcript available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <ParsedTranscript text={text} />
    </div>
  );
};

export default TranscriptView;
