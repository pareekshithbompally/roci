import React, { memo, useMemo } from 'react';
import { AnimatedProviderIcon } from '@features/chat/components/AnimatedProviderIcon';
import { StreamingMarkdown } from '@features/chat/components/StreamingMarkdown';
import { useStreamingText } from '@features/chat/stores/streamingStore';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { toolLabel } from '@shared/utils/toolUtils';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import { injectCitationTokens } from '@shared/utils/inlineCitationInjector';
import PartsList from './PartsList';
import AssistantActionBar from './AssistantActionBar';
import ErrorMessageBox from './ErrorMessageBox';
import type { AssistantMessageProps } from './types';
import type { ChatPart, WebCitation, InlineCitationSpan } from '@shared/types';

/**
 * Streaming-aware header label — subscribes to the external store.
 * During tool phase (no text yet): shows active tool name.
 * During text phase: shows provider/model.
 * Isolated so only this component re-renders on streaming store changes.
 */
const StreamingHeaderLabel = memo(({
  msgId, provider, model,
}: {
  msgId: string; provider?: string; model?: string;
}) => {
  const streaming = useStreamingText();

  if (streaming.msgId === msgId) {
    const toolParts = streaming.parts.filter(
      (p): p is Extract<ChatPart, { type: 'tool_call' }> => p.type === 'tool_call'
    );
    const hasText = streaming.parts.some(p => p.type === 'text');

    // Still in tool phase (no text yet) — show current tool label
    if (toolParts.length > 0 && !hasText) {
      const active = toolParts.find(p => p.status === 'calling') || toolParts[toolParts.length - 1];
      if (active) {
        const status = active.status === 'calling' ? 'calling' as const : 'complete' as const;
        return <>{toolLabel(active.toolName, status)}</>;
      }
    }
  }

  return (
    <>
      {getProviderTitle(provider)}
      {model && <span className={`font-normal ${TEXT.faint}`}> · {model}</span>}
    </>
  );
});

StreamingHeaderLabel.displayName = 'StreamingHeaderLabel';

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
  provider, model, state, loadingLabel,
  tokenCount, inputTokenCount, tokensPerSecond,
  toolActivity, meetingCitations,
  isCopied, actions, citationHandlers,
  webCitations, inlineCitations, isError,
}) => {
  const isLoading = state === 'loading';
  const isStreaming = state === 'streaming';
  const isComplete = state === 'complete';

  // Lazy migration: synthesize tool_call parts from legacy toolActivity data
  const effectiveParts = useMemo(() => {
    const base = parts || [];
    if (base.some(p => p.type === 'tool_call')) return base;
    if (!toolActivity?.calls?.length) return base;
    return [
      ...base,
      ...toolActivity.calls.map((c, index) => ({
        type: 'tool_call' as const,
        toolCallId: `legacy-${c.toolName}-${index}`,
        toolName: c.toolName,
        arguments: {} as Record<string, unknown>,
        status: 'complete' as const,
        result: {
          content: c.resultSummary || 'Done',
          isError: false,
          executionMs: c.executionMs,
        },
      })),
    ];
  }, [parts, toolActivity]);

  // Merge meetingCitations from both new and legacy sources
  const effectiveMeetingCitations = meetingCitations || toolActivity?.citations;

  return (
    <div className="w-full min-h-[60px]">
      {/* Provider/Model Header — always visible, consistent across all states */}
      <div className="flex items-center gap-2 mb-2">
        <AnimatedProviderIcon provider={provider || 'unknown'} size={18} isAnimating={isLoading || isStreaming} />
        <span className={`${TYPOGRAPHY_CLASSES.chatProvider} ${TEXT.muted}`}>
          {isLoading
            ? loadingLabel || 'Working on it...'
            : isStreaming
              ? <StreamingHeaderLabel msgId={id} provider={provider} model={model} />
              : (
              <>
                {getProviderTitle(provider)}
                {model && <span className={`font-normal ${TEXT.faint}`}> · {model}</span>}
              </>
            )}
        </span>
      </div>

      {/* STREAMING or COMPLETE STATE */}
      {(isStreaming || isComplete) && (
        <>
          {/* Message Content */}
          <div className="relative">
            {isStreaming ? (
              <StreamingContent msgId={id} />
            ) : isError && text ? (
              <ErrorMessageBox errorText={text} />
            ) : (
              <CompletedContent
                text={text}
                parts={effectiveParts}
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
              inputTokenCount={inputTokenCount}
              tokensPerSecond={tokensPerSecond}
              actions={actions}
              meetingCitations={effectiveMeetingCitations}
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
