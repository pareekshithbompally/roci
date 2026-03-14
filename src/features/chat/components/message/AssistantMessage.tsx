import React, { memo, useMemo } from 'react';
import { AnimatedProviderIcon } from '../AnimatedProviderIcon';
import { StreamingMarkdown } from '../StreamingMarkdown';
import { ToolActivityIndicator } from '../ToolActivityIndicator';
import { useStreamingText } from '@features/chat/stores/streamingStore';
import { getProviderTitle } from '@/utils/providerUtils';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import { injectCitationTokens } from '@shared/utils/inlineCitationInjector';
import PartsList from './PartsList';
import AssistantActionBar from './AssistantActionBar';
import type { AssistantMessageProps } from './types';
import type { ChatPart, WebCitation, InlineCitationSpan } from '@/types';

/**
 * Inner streaming content — subscribes to the external store.
 * Isolated so that only this component re-renders on each streaming chunk.
 */
const StreamingContent = memo(({ msgId }: { msgId: string }) => {
  const streaming = useStreamingText();

  if (streaming.msgId !== msgId || streaming.parts.length === 0) return null;

  return (
    <PartsList
      parts={streaming.parts}
      messageId={msgId}
      streaming={true}
    />
  );
});

StreamingContent.displayName = 'StreamingContent';

/** Renders completed message content from parts or text fallback */
const CompletedContent: React.FC<{
  text: string;
  parts?: ChatPart[];
  messageId: string;
  webCitations?: WebCitation[];
  inlineCitations?: InlineCitationSpan[];
}> = ({ text, parts, messageId, webCitations, inlineCitations }) => {
  const hasInline = !!(inlineCitations?.length && webCitations?.length);

  const processText = useMemo(() => {
    if (!hasInline) return undefined;
    return (t: string) => injectCitationTokens(t, inlineCitations!);
  }, [hasInline, inlineCitations]);

  const processedText = useMemo(() => {
    if (!hasInline) return text;
    return injectCitationTokens(text, inlineCitations!);
  }, [text, hasInline, inlineCitations]);

  if (parts && parts.length > 0) {
    return (
      <PartsList
        parts={parts}
        messageId={messageId}
        streaming={false}
        processText={processText}
        webCitations={hasInline ? webCitations : undefined}
      />
    );
  }

  return (
    <StreamingMarkdown
      content={processedText}
      streaming={false}
      messageId={messageId}
      webCitations={hasInline ? webCitations : undefined}
    />
  );
};

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  id, text, parts, timestamp,
  suggestions, onSuggestionClick, isLastMessage,
  provider, model, state,
  tokenCount, tokensPerSecond,
  toolActivity, preparingTools,
  isCopied, actions, citationHandlers,
  webCitations, inlineCitations,
}) => {
  const isLoading = state === 'loading';
  const isStreaming = state === 'streaming';
  const isComplete = state === 'complete';

  return (
    <div className="w-full min-h-[60px]">
      {/* Provider/Model Header — always visible, consistent across all states */}
      <div className="flex items-center gap-2 mb-2">
        <AnimatedProviderIcon provider={provider || 'unknown'} size={18} isAnimating={isLoading || isStreaming} />
        <span className={`${TYPOGRAPHY_CLASSES.chatProvider} ${TEXT.muted}`}>
          {isLoading
            ? provider === 'llamacpp'
              ? `Loading ${model || 'model'} into memory...`
              : preparingTools
                ? 'Preparing tools...'
                : 'Working on it...'
            : (
            <>
              {getProviderTitle(provider)}
              {model && <span className={`font-normal ${TEXT.faint}`}> · {model}</span>}
            </>
          )}
        </span>
      </div>

      {/* Tool Activity Indicator — shown while tools are executing */}
      {!isComplete && <ToolActivityIndicator />}

      {/* STREAMING or COMPLETE STATE */}
      {(isStreaming || isComplete) && (
        <>
          {/* Message Content */}
          <div className="relative">
            {isStreaming ? (
              <StreamingContent msgId={id} />
            ) : (
              <CompletedContent
                text={text}
                parts={parts}
                messageId={id}
                webCitations={webCitations}
                inlineCitations={inlineCitations}
              />
            )}
          </div>

          {/* Action Bar — only when complete */}
          {isComplete && text && (
            <AssistantActionBar
              id={id}
              text={text}
              timestamp={timestamp}
              isLastMessage={isLastMessage}
              isCopied={isCopied}
              tokenCount={tokenCount}
              tokensPerSecond={tokensPerSecond}
              actions={actions}
              toolActivity={toolActivity}
              suggestions={suggestions}
              onSuggestionClick={onSuggestionClick}
              citationHandlers={citationHandlers}
              webCitations={webCitations}
            />
          )}
        </>
      )}
    </div>
  );
};

export default AssistantMessage;
