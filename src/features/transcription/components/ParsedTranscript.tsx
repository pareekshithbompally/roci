import React, { useRef, useEffect, useMemo } from 'react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import SpeakerBadge from './SpeakerBadge';
import type { StoredTranscriptSegment } from '@shared/types';

interface ParsedTranscriptProps {
  text?: string;
  segments?: StoredTranscriptSegment[];
  highlightText?: string;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Splits content into before/match/after and wraps match in a <mark> */
function HighlightedText({ content, highlight }: { content: string; highlight: string }) {
  const normalContent = content.toLowerCase();
  const normalHighlight = highlight.toLowerCase();
  const idx = normalContent.indexOf(normalHighlight);
  if (idx === -1) return <>{content}</>;
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

function hasAnyTimestamp(segments: StoredTranscriptSegment[]): boolean {
  return segments.some((s) => s.startSecond > 0 || s.endSecond > 0);
}

/**
 * Builds a map of speaker → stable index for consistent color assignment
 * across segments. Preserves insertion order.
 */
function buildSpeakerIndex(segments: StoredTranscriptSegment[]): Map<string, number> {
  const map = new Map<string, number>();
  let next = 0;
  for (const seg of segments) {
    if (seg.speaker && !map.has(seg.speaker)) {
      map.set(seg.speaker, next++);
    }
  }
  return map;
}

const EmptyState: React.FC = () => (
  <div className="p-6 rounded-xl bg-paper-50 dark:bg-night-900/40 border border-paper-300 dark:border-night-800/60">
    <p className="text-paper-600 dark:text-night-500 leading-relaxed text-center">
      No transcript available.
    </p>
  </div>
);

const PlainTextBlock: React.FC<{ text: string; highlightText?: string }> = ({ text, highlightText }) => {
  const normalized = highlightText?.slice(0, 100).toLowerCase() ?? '';
  const isMatch = normalized && text.toLowerCase().includes(normalized);
  return (
    <div className={`p-6 rounded-xl bg-paper-50 dark:bg-night-900/40 border border-paper-300 dark:border-night-800/60 ${isMatch ? 'bg-amber-200/60 dark:bg-amber-800/40' : ''}`}>
      <p className="text-paper-900 dark:text-night-300 leading-relaxed whitespace-pre-wrap">
        {highlightText && isMatch
          ? <HighlightedText content={text} highlight={highlightText.slice(0, 100)} />
          : text
        }
      </p>
    </div>
  );
};

const RegexFallbackBlock: React.FC<{ text: string; highlightText?: string }> = ({ text, highlightText }) => {
  const regexSegments = useMemo(() => {
    const parts = text.split(/(?=\[\d{1,2}:\d{2}\])/).filter(s => s.trim().length > 0);
    if (parts.length <= 1 && !text.includes('[00:00]')) return null;
    return parts.map((segment) => {
      const timeMatch = segment.match(/\[(\d{1,2}:\d{2})\]/);
      return {
        timestamp: timeMatch ? timeMatch[1] : null,
        content: segment.replace(/\[\d{1,2}:\d{2}\]/, '').trim(),
      };
    });
  }, [text]);

  if (!regexSegments) {
    return <PlainTextBlock text={text} highlightText={highlightText} />;
  }

  return (
    <div className="space-y-4">
      {regexSegments.map(({ timestamp, content }, index) => {
        const isHighlighted = highlightText
          ? content.toLowerCase().includes(highlightText.slice(0, 100).toLowerCase())
          : false;
        return (
          <div
            key={index}
            className={`flex gap-3 p-4 rounded-xl border transition-colors group ${
              isHighlighted
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
                : 'bg-paper-50 dark:bg-night-900/40 border-paper-300 dark:border-night-800/60'
            }`}
          >
            <div className="shrink-0">
              {timestamp && (
                <span className="inline-flex px-2 py-1 rounded bg-paper-100 dark:bg-night-800 text-[10px] font-mono text-paper-600 dark:text-night-400 border border-paper-300 dark:border-night-700/50">
                  {timestamp}
                </span>
              )}
            </div>
            <p className={`${TYPOGRAPHY_CLASSES.transcriptText} text-paper-900 dark:text-night-300 leading-relaxed`}>
              {highlightText && isHighlighted
                ? <HighlightedText content={content} highlight={highlightText.slice(0, 100)} />
                : content
              }
            </p>
          </div>
        );
      })}
    </div>
  );
};

/**
 * ParsedTranscript — native segment rendering with 3-tier fallback:
 *
 * Tier 1: Structured segments with timestamps → timestamp column + speaker badges
 * Tier 2: Structured segments without timestamps → per-segment display, speaker badges only
 * Tier 3: Plain text → regex [MM:SS] re-parse for backward compat, or plain text block
 */
const ParsedTranscript: React.FC<ParsedTranscriptProps> = ({ text, segments, highlightText }) => {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const firstMatchIdxRef = useRef<number>(-1);

  const hasSegments = segments && segments.length > 0;
  const showTimestamps = hasSegments ? hasAnyTimestamp(segments!) : false;
  const speakerIndex = useMemo(
    () => (hasSegments ? buildSpeakerIndex(segments!) : new Map<string, number>()),
    [segments],
  );

  const normalizedHighlight = highlightText?.slice(0, 100).toLowerCase() ?? '';

  // Compute first highlighted segment index (before render)
  firstMatchIdxRef.current = -1;
  if (hasSegments && normalizedHighlight) {
    for (let i = 0; i < segments!.length; i++) {
      if (segments![i].text.toLowerCase().includes(normalizedHighlight)) {
        firstMatchIdxRef.current = i;
        break;
      }
    }
  }

  // Auto-scroll to first highlighted segment
  useEffect(() => {
    if (firstMatchIdxRef.current < 0) return;
    const el = segmentRefs.current[firstMatchIdxRef.current];
    if (!el) return;

    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const { overflowY } = getComputedStyle(scrollParent);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = scrollParent.getBoundingClientRect();
    const offset = elRect.top - containerRect.top + scrollParent.scrollTop;
    scrollParent.scrollTo({
      top: Math.max(0, offset - scrollParent.clientHeight / 2 + el.clientHeight / 2),
      behavior: 'smooth',
    });
  }, [highlightText, segments]);

  // Empty state
  if ((!text || text.trim().length === 0) && !hasSegments) {
    return <EmptyState />;
  }

  // Tier 3: Plain text fallback (no structured segments)
  if (!hasSegments) {
    return <RegexFallbackBlock text={text!} highlightText={highlightText} />;
  }

  // Tier 1 & 2: Native structured segments
  return (
    <div className="space-y-3">
      {segments!.map((seg, index) => {
        const isHighlighted = normalizedHighlight && seg.text.toLowerCase().includes(normalizedHighlight);
        const speakerColorIdx = seg.speaker ? speakerIndex.get(seg.speaker) : undefined;

        return (
          <div
            key={index}
            ref={(el) => { segmentRefs.current[index] = el; }}
            className={`flex gap-3 p-4 rounded-xl border transition-colors group ${
              isHighlighted
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
                : 'bg-paper-50 dark:bg-night-900/40 border-paper-300 dark:border-night-800/60'
            }`}
          >
            {/* Timestamp column (Tier 1 only) */}
            {showTimestamps && (
              <div className="shrink-0 pt-0.5">
                <span className="inline-flex px-2 py-1 rounded bg-paper-100 dark:bg-night-800 text-[10px] font-mono text-paper-600 dark:text-night-400 border border-paper-300 dark:border-night-700/50">
                  {formatTimestamp(seg.startSecond)}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Speaker badge row */}
              {seg.speaker && speakerColorIdx !== undefined && (
                <div className="mb-1">
                  <SpeakerBadge speaker={seg.speaker} index={speakerColorIdx} />
                </div>
              )}

              {/* Transcript text */}
              <p className={`${TYPOGRAPHY_CLASSES.transcriptText} text-paper-900 dark:text-night-300 leading-relaxed`}>
                {highlightText && isHighlighted
                  ? <HighlightedText content={seg.text} highlight={highlightText.slice(0, 100)} />
                  : seg.text
                }
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ParsedTranscript;
