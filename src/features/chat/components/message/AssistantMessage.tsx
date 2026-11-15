import React, { memo, useMemo, useRef } from 'react';
import { Markdown } from '@shared/components';
import { AnimatedProviderIcon } from '@features/chat/components/AnimatedProviderIcon';
import { useStreamingText } from '@features/chat/stores/streamingStore';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { toolCallTitle } from '@features/chat/components/tool-call';
import { Progress, Text } from '@shared/ui';
import { useReadAloud } from '@shared/hooks/useReadAloud';
import { useSpeechHighlight } from '@shared/hooks/useSpeechHighlight';
import { injectCitationTokens } from '@shared/utils/inlineCitationInjector';
import PartsList from './PartsList';
import { loadingStatusOf } from './loadingStatus';
import AssistantActionBar from './AssistantActionBar';
import ErrorMessageBox from './ErrorMessageBox';
import type { AssistantMessageProps } from './types';
import type { ChatPart, WebCitation, InlineCitationSpan } from '@shared/types';

/** Header label (active tool, then provider/model), isolated so only it re-renders on stream updates. */
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
      if (active) return <>{toolCallTitle(active)}</>;
    }
  }

  return (
    <>
      {getProviderTitle(provider)}
      {model && <Text variant="helper" tone="faint"> · {model}</Text>}
    </>
  );
});

StreamingHeaderLabel.displayName = 'StreamingHeaderLabel';

/** Streaming content, isolated so only it re-renders on each chunk. */
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
    <Markdown
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
  provider, model, state, loadingStatus,
  tokenCount, inputTokenCount, tokensPerSecond,
  toolActivity, meetingCitations,
  isCopied, actions, citationHandlers,
  webCitations, inlineCitations, isError,
}) => {
  const isLoading = state === 'loading';
  const status = loadingStatus ?? loadingStatusOf(null);
  const isStreaming = state === 'streaming';
  const isComplete = state === 'complete';

  // Read aloud: the action bar's button, and the spoken chunk highlighted in the body.
  const readAloud = useReadAloud(id, text);
  const bodyRef = useRef<HTMLDivElement>(null);
  useSpeechHighlight(bodyRef, readAloud.spoken);

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
    <div className="w-full min-h-15">
      {/* Provider/Model Header — always visible, consistent across all states */}
      <div className="flex items-center gap-2 mb-2">
        <AnimatedProviderIcon provider={provider || 'unknown'} modelId={model} size={18} isAnimating={isLoading || isStreaming} />
        <Text variant="label" tone="muted">
          {isLoading
            ? status.label
            : isStreaming
              ? <StreamingHeaderLabel msgId={id} provider={provider} model={model} />
              : (
              <>
                {getProviderTitle(provider)}
                {model && <Text variant="helper" tone="faint"> · {model}</Text>}
              </>
            )}
        </Text>
        {isLoading && status.percent !== null && <Progress key={status.label} percent={status.percent} size="compact" />}
        {isLoading && status.detail && <Text variant="mono" tone="faint">{status.detail}</Text>}
      </div>

      {/* STREAMING or COMPLETE STATE */}
      {(isStreaming || isComplete) && (
        <>
          {/* Message Content */}
          <div ref={bodyRef} className="relative">
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
              readAloud={readAloud}
            />
          )}
        </>
      )}
    </div>
  );
};

export default AssistantMessage;
