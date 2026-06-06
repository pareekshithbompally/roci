import React, { useRef, useEffect } from 'react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface ParsedTranscriptProps {
  text?: string;
  /** When provided, highlights the first matching segment and scrolls it into view */
  highlightText?: string;
}

/** Splits segment content into before/match/after and wraps match in a <mark> */
function HighlightedText({ content, highlight }: { content: string; highlight: string }) {
  const normalContent = content.toLowerCase();
  const normalHighlight = highlight.toLowerCase();
  const idx = normalContent.indexOf(normalHighlight);
  if (idx === -1) {
    return <>{content}</>;
  }
  const before = content.slice(0, idx);
  const match = content.slice(idx, idx + highlight.length);
  const after = content.slice(idx + highlight.length);
  return (
    <>
      {before}
      <mark className="bg-amber-200/60 dark:bg-amber-800/40 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

/**
 * ParsedTranscript Component
 *
 * Parses and displays transcript text with timestamps.
 * Detects timestamp format [MM:SS] and separates into segments.
 * Falls back to plain text if no timestamps detected.
 *
 * When `highlightText` is provided, the first matching segment is highlighted
 * and auto-scrolled into view.
 */
const ParsedTranscript: React.FC<ParsedTranscriptProps> = ({ text, highlightText }) => {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const firstMatchIdxRef = useRef<number>(-1);

  // Auto-scroll to first highlighted segment when highlightText changes.
  // Uses scrollTo on the nearest scrollable ancestor instead of scrollIntoView,
  // which would propagate to ALL ancestors and push the chat view during drawer slide-in.
  useEffect(() => {
    if (firstMatchIdxRef.current < 0) return;
    const el = segmentRefs.current[firstMatchIdxRef.current];
    if (!el) return;

    // Find nearest scrollable ancestor
    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const { overflowY } = getComputedStyle(scrollParent);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) return;

    // Both el and scrollParent share the same transformed ancestor (the drawer),
    // so getBoundingClientRect differences cancel out the transform — correct at any point.
    const elRect = el.getBoundingClientRect();
    const containerRect = scrollParent.getBoundingClientRect();
    const offset = elRect.top - containerRect.top + scrollParent.scrollTop;
    scrollParent.scrollTo({
      top: Math.max(0, offset - scrollParent.clientHeight / 2 + el.clientHeight / 2),
      behavior: 'smooth',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightText]);

  // Handle undefined or null text
  if (!text || text.trim().length === 0) {
    return (
      <div className="p-6 rounded-xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60">
        <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed text-center">
          No transcript available.
        </p>
      </div>
    );
  }

  // Split by timestamp pattern [00:00]
  const segments = text.split(/(?=\[\d{1,2}:\d{2}\])/).filter(s => s.trim().length > 0);

  // No timestamps detected - show as plain text
  if (segments.length <= 1 && !text.includes('[00:00]')) {
    const normalizedHighlight = highlightText?.slice(0, 100).toLowerCase() ?? '';
    const isMatch = normalizedHighlight && text.toLowerCase().includes(normalizedHighlight);
    return (
      <div className={`p-6 rounded-xl bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60 ${isMatch ? 'bg-amber-200/60 dark:bg-amber-800/40' : ''}`}>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {highlightText && isMatch
            ? <HighlightedText content={text} highlight={highlightText.slice(0, 100)} />
            : text
          }
        </p>
      </div>
    );
  }

  // Compute which segments match highlight (before render so we can track firstMatchIdx)
  const normalizedHighlight = highlightText?.slice(0, 100).toLowerCase() ?? '';
  firstMatchIdxRef.current = -1;

  const segmentData = segments.map((segment, index) => {
    const timeMatch = segment.match(/\[(\d{1,2}:\d{2})\]/);
    const timestamp = timeMatch ? timeMatch[1] : null;
    const content = segment.replace(/\[\d{1,2}:\d{2}\]/, '').trim();
    const isHighlighted = normalizedHighlight.length > 0 && content.toLowerCase().includes(normalizedHighlight);
    if (isHighlighted && firstMatchIdxRef.current === -1) {
      firstMatchIdxRef.current = index;
    }
    return { timestamp, content, isHighlighted };
  });

  // Render segments with timestamps
  return (
    <div className="space-y-4">
      {segmentData.map(({ timestamp, content, isHighlighted }, index) => (
        <div
          key={index}
          ref={el => { segmentRefs.current[index] = el; }}
          className={`flex gap-3 p-4 rounded-xl border transition-colors group ${
            isHighlighted
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
              : 'bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/60'
          }`}
        >
          <div className="shrink-0">
            {timestamp && (
              <span
                className="inline-flex px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-500 border border-zinc-200 dark:border-zinc-700/50"
                aria-label={`Timestamp ${timestamp}`}
              >
                {timestamp}
              </span>
            )}
          </div>
          <p className={`${TYPOGRAPHY_CLASSES.transcriptText} text-zinc-700 dark:text-zinc-300 leading-relaxed`}>
            {highlightText && isHighlighted
              ? <HighlightedText content={content} highlight={highlightText.slice(0, 100)} />
              : content
            }
          </p>
        </div>
      ))}
    </div>
  );
};

export default ParsedTranscript;
