import React from 'react';
import { FileText } from 'lucide-react';
import ParsedTranscript from '@features/transcription/components/ParsedTranscript';
import EmptyState from '@shared/components/EmptyState';
import type { StoredTranscriptSegment } from '@shared/types';

interface TranscriptViewProps {
  text?: string;
  timestamp?: number;
  title?: string;
  segments?: StoredTranscriptSegment[];
}

const TranscriptView: React.FC<TranscriptViewProps> = ({
  text,
  segments,
}) => {
  if ((!text || text.trim().length === 0) && (!segments || segments.length === 0)) {
    return (
      <div className="flex flex-col min-h-full items-center justify-center">
        <EmptyState icon={FileText} message="No transcript available" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <ParsedTranscript text={text} segments={segments} />
    </div>
  );
};

export default TranscriptView;
