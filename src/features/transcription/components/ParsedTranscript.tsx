import React, { useRef, useEffect, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { Surface, Text } from '@shared/ui';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { EmptyState, HighlightedText } from '@shared/components';
import { toTranscriptBlocks, type TranscriptBlock } from '@features/transcription/utils/transcriptBlocks';
import type { StoredTranscriptSegment } from '@shared/types';

interface ParsedTranscriptProps {
  text?: string;
  segments?: StoredTranscriptSegment[];
  /** Search match to tint and scroll into view (citation drawer). */
  highlightText?: string;
}

interface BlockProps {
  block: TranscriptBlock;
  /** Speaker line only when the speaker changes. */
  showHeader: boolean;
  highlight: string;
  ref?: React.Ref<HTMLElement>;
}

/** One turn: a long silence before it, the speaker when it changes, then reading text. */
const Block: React.FC<BlockProps> = ({ block, showHeader, highlight, ref }) => {
  const isMatch = highlight !== '' && block.text.toLowerCase().includes(highlight.toLowerCase());
  return (
    <Surface ref={ref} variant={isMatch ? 'subtle' : 'plain'} radius="md" className="-mx-3 px-3 py-1.5">
      {block.silenceBefore && (
        <Text as="p" variant="figureSmall" tone="faint">{`${block.silenceBefore} ${TRANSCRIPTION_CONFIG.turns.silence}`}</Text>
      )}
      {showHeader && <Text variant="headline">{block.speaker}</Text>}
      <Text as="p" variant="reading">
        <HighlightedText text={block.text} highlight={isMatch ? highlight : ''} />
      </Text>
    </Surface>
  );
};

/** Scroll the nearest scrolling ancestor so `el` sits mid-view. */
function scrollIntoMiddle(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
  if (!parent) return;
  const offset = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop;
  parent.scrollTo({ top: Math.max(0, offset - parent.clientHeight / 2 + el.clientHeight / 2), behavior: 'smooth' });
}

/** A transcript as readable paragraphs — STT segments or normalized plain text (see transcriptBlocks). */
const ParsedTranscript: React.FC<ParsedTranscriptProps> = ({ text, segments, highlightText }) => {
  const blocks = useMemo(() => toTranscriptBlocks(text, segments), [text, segments]);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const highlight = highlightText?.slice(0, 100) ?? '';

  useEffect(() => {
    if (!highlight) return;
    const needle = highlight.toLowerCase();
    const index = blocks.findIndex((b) => b.text.toLowerCase().includes(needle));
    const el = refs.current[index];
    if (el) scrollIntoMiddle(el);
  }, [highlight, blocks]);

  if (blocks.length === 0) return <EmptyState icon={FileText} message="No transcript available" />;

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <Block
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          block={block}
          showHeader={!!block.speaker && block.speaker !== blocks[i - 1]?.speaker}
          highlight={highlight}
        />
      ))}
    </div>
  );
};

export default ParsedTranscript;
