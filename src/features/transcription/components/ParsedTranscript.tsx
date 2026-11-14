import React, { useRef, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Surface, Text } from '@shared/ui';
import { EmptyState, HighlightedText } from '@shared/components';
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

interface SegmentRowProps {
  /** null hides the time column; undefined omits it entirely */
  time?: string | null;
  speaker?: React.ReactNode;
  content: string;
  highlight: string;
  ref?: React.Ref<HTMLElement>;
}

/** One transcript line: time, optional speaker, reading text; a quiet fill when it holds the match. */
const SegmentRow: React.FC<SegmentRowProps> = ({ time, speaker, content, highlight, ref }) => {
  const isHighlighted = highlight !== '' && content.toLowerCase().includes(highlight.toLowerCase());
  return (
    <Surface ref={ref} variant={isHighlighted ? 'subtle' : 'plain'} radius="lg" className="flex gap-3 px-3 py-2">
      {time !== undefined && (
        <Text variant="mono" tone="faint" className="shrink-0 pt-0.5 w-10">{time}</Text>
      )}
      <div className="flex-1 min-w-0">
        {speaker && <div className="mb-0.5">{speaker}</div>}
        <Text as="p" variant="reading" className="leading-relaxed">
          <HighlightedText text={content} highlight={isHighlighted ? highlight : ''} />
        </Text>
      </div>
    </Surface>
  );
};

const RegexFallbackBlock: React.FC<{ text: string; highlight: string }> = ({ text, highlight }) => {
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
    return (
      <Text as="p" variant="reading" className="leading-relaxed whitespace-pre-wrap">
        <HighlightedText text={text} highlight={highlight} />
      </Text>
    );
  }

  return (
    <div className="space-y-1">
      {regexSegments.map(({ timestamp, content }, index) => (
        <SegmentRow key={index} time={timestamp} content={content} highlight={highlight} />
      ))}
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
  const segmentRefs = useRef<(HTMLElement | null)[]>([]);
  const firstMatchIdxRef = useRef<number>(-1);

  const hasSegments = segments && segments.length > 0;
  const showTimestamps = hasSegments ? hasAnyTimestamp(segments!) : false;
  const speakerIndex = useMemo(
    () => (hasSegments ? buildSpeakerIndex(segments!) : new Map<string, number>()),
    [segments],
  );

  const highlight = highlightText?.slice(0, 100) ?? '';
  const normalizedHighlight = highlight.toLowerCase();

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
    return <EmptyState icon={FileText} message="No transcript available" />;
  }

  // Tier 3: Plain text fallback (no structured segments)
  if (!hasSegments) {
    return <RegexFallbackBlock text={text!} highlight={highlight} />;
  }

  // Tier 1 & 2: Native structured segments
  return (
    <div className="space-y-1">
      {segments!.map((seg, index) => {
        const speakerColorIdx = seg.speaker ? speakerIndex.get(seg.speaker) : undefined;
        return (
          <SegmentRow
            key={index}
            ref={(el) => { segmentRefs.current[index] = el; }}
            time={showTimestamps ? formatTimestamp(seg.startSecond) : undefined}
            speaker={seg.speaker && speakerColorIdx !== undefined
              ? <SpeakerBadge speaker={seg.speaker} index={speakerColorIdx} />
              : undefined}
            content={seg.text}
            highlight={highlight}
          />
        );
      })}
    </div>
  );
};

export default ParsedTranscript;
