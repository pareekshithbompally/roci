import React from 'react';
import { Lightbulb } from 'lucide-react';
import { Disclosure, Icon, Text } from '@shared/ui';
import type { DisclosureVariant } from '@shared/ui';
import { Markdown } from '@shared/components';
import { CHAT_REASONING_COPY } from '@config/chat.config';
import { META_SEPARATOR } from '@config/ui.config';
import { formatExecutionMs } from '@features/chat/components/tool-call';
import { useFollowBottom } from '@features/chat/hooks/useFollowBottom';
import type { GenerationStats } from '@services/ai/types';

interface ReasoningBlockProps {
  text: string;
  /** The model is still thinking: the label shimmers; opened, the text is capped and follows its newest line. */
  thinking: boolean;
  /** Tokens and speed while thinking, when a local server reports them. */
  generation?: GenerationStats | null;
  /** `inline` at the top of a reply, flush with its text; `row` (default) when nested in a folded run. */
  variant?: DisclosureVariant;
}

/** "214 tokens · 12.3s · 9.4 tok/s": what a local server has generated, for how long, and how fast. */
function statsLine({ tokens, elapsedMs, tokensPerSecond }: GenerationStats): string {
  return [CHAT_REASONING_COPY.tokens(tokens), formatExecutionMs(elapsedMs), CHAT_REASONING_COPY.speed(tokensPerSecond)].join(META_SEPARATOR);
}

/** The thinking as aside markdown (muted, small, tight): a rolling window of about eight lines that follows its newest line while it streams, in full once done. */
function ReasoningText({ text, thinking }: { text: string; thinking: boolean }) {
  const { scrollRef, contentRef, onScroll, onWheel } = useFollowBottom();
  return (
    <div ref={scrollRef} onScroll={onScroll} onWheel={onWheel} className={thinking ? 'max-h-36 overflow-y-auto' : undefined}>
      <div ref={contentRef}>
        <Markdown content={text} streaming={thinking} variant="aside" />
      </div>
    </div>
  );
}

/** The model's thinking: one folded line that shimmers while it thinks; opening it shows the text in place. */
export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ text, thinking, generation, variant }) => (
    <Disclosure
      variant={variant}
      summary={
        <>
          <Icon icon={Lightbulb} size="xs" tone="faint" className="shrink-0" />
          <Text tone="muted" shimmer={thinking} truncate className="min-w-0 mr-auto">
            {thinking ? CHAT_REASONING_COPY.thinking : CHAT_REASONING_COPY.done}
          </Text>
          {thinking && generation && (
            <Text variant="caption" tone="faint" className="shrink-0">
              {statsLine(generation)}
            </Text>
          )}
        </>
      }
    >
      <ReasoningText text={text} thinking={thinking} />
    </Disclosure>
);
