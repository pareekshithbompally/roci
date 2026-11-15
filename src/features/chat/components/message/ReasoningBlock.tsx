import React from 'react';
import { Lightbulb } from 'lucide-react';
import { Disclosure, Icon, Text } from '@shared/ui';
import type { DisclosureVariant } from '@shared/ui';
import { Markdown } from '@shared/components';
import { CHAT_REASONING_COPY } from '@config/chat.config';
import { META_SEPARATOR } from '@config/ui.config';
import { formatExecutionMs } from '@features/chat/components/tool-call';
import { useAutoFold } from '@features/chat/hooks/useAutoFold';
import { useFollowBottom } from '@features/chat/hooks/useFollowBottom';
import type { GenerationStats } from '@services/ai/types';

interface ReasoningBlockProps {
  text: string;
  /** The model is still thinking: the block is open, capped, and follows the newest line. */
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

/** The model's thinking: open and rolling while it thinks, folded once the answer starts, reopenable any time. */
export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ text, thinking, generation, variant }) => {
  const [open, setOpen] = useAutoFold(thinking);
  return (
    <Disclosure
      variant={variant}
      open={open}
      onOpenChange={setOpen}
      summary={
        <>
          <Icon icon={Lightbulb} size="xs" tone="faint" className="shrink-0" />
          <Text tone="muted" truncate className="flex-1 min-w-0">
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
};
