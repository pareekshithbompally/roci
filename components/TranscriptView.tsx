import React, { useEffect, useRef } from 'react';
import { TranscriptSegment } from '../types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentText: string;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ segments, currentText }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, currentText]);

  if (segments.length === 0 && !currentText) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <p>No audio captured yet.</p>
        <p className="text-sm mt-2">Start recording to see transcript.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 p-4 pb-20">
      {segments.map((seg) => (
        <div key={seg.id} className="flex flex-col animate-fade-in">
          <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
            <p className="text-zinc-200 leading-relaxed text-lg">{seg.text}</p>
            <span className="text-xs text-zinc-500 mt-2 block font-mono">
              {new Date(seg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}
      
      {currentText && (
        <div className="flex flex-col animate-pulse">
           <div className="bg-zinc-800/30 p-4 rounded-lg border border-zinc-700/30 border-dashed">
            <p className="text-zinc-300 leading-relaxed italic text-lg">{currentText}...</p>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptView;
