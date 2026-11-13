import React, { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '@shared/types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  currentText: string;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ segments, currentText }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Stick to bottom only while the user is already near it — manual
  // scroll-up during live recording must not be yanked back down.
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const { overflowY } = getComputedStyle(scrollParent);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }
    if (scrollParent) {
      const distanceFromBottom =
        scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight;
      if (distanceFromBottom > 160) return;
    }
    el.scrollIntoView({ behavior: 'smooth' });
  }, [segments, currentText]);

  if (segments.length === 0 && !currentText) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-paper-600 dark:text-night-500">
        <p>No audio captured yet.</p>
        <p className="text-sm mt-2">Start recording to see transcript.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 p-4 pb-20">
      {segments.map((seg) => (
        <div key={seg.id} className="flex flex-col animate-fade-in">
          <div className="bg-paper-200 dark:bg-night-800/50 p-4 rounded-lg border border-paper-300 dark:border-night-700/50">
            <p className="text-paper-800 dark:text-night-200 leading-relaxed text-lg">{seg.text}</p>
            <span className="text-xs text-paper-600 dark:text-night-500 mt-2 block font-mono">
              {new Date(seg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}

      {currentText && (
        <div className="flex flex-col animate-pulse">
           <div className="bg-paper-200 dark:bg-night-800/30 p-4 rounded-lg border border-paper-300 dark:border-night-700/30 border-dashed">
            <p className="text-paper-900 dark:text-night-300 leading-relaxed italic text-lg">{currentText}...</p>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptView;
