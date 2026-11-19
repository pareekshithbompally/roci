import React, { memo, useMemo, useRef } from 'react';
import { Markdown } from '@shared/components';
import { AnimatedProviderIcon } from '@features/chat/components/AnimatedProviderIcon';
import { useStreamingText } from '@features/chat/stores/streamingStore';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { useModelLabel } from '@shared/hooks/useModelLabel';
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

/** "localhost:9931 · Gemma": the provider, then the model by its display name (its rename, if any); one name when they match. */
function ProviderModelLabel({ provider, model }: { provider?: string; model?: string }) {
  const modelLabel = useModelLabel(provider, model);
  const providerTitle = getProviderTitle(provider);
  return (
    <>
      {providerTitle}
      {modelLabel && modelLabel !== providerTitle && <Text variant="helper" tone="faint"> · {modelLabel}</Text>}
    </>
  );
}

/** Streaming content, isolated so only it re-renders on each chunk. */
const StreamingContent = memo(({ msgId }: { msgId: string }) => {
  const streaming = useStreamingText();

  if (streaming.msgId !== msgId || streaming.parts.length === 0) return null;

  return (
    <PartsList
      parts={streaming.parts}
      messageId={msgId}
      streaming={true}
      generation={streaming.generation}
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
  context, tokensPerSecond,
  meetingCitations,
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

  return (
    <div className="w-full min-h-15">
      {/* Provider/Model Header — always visible, consistent across all states */}
      <div className="flex items-center gap-2 mb-2">
        <AnimatedProviderIcon provider={provider || 'unknown'} modelId={model} size={18} isAnimating={isLoading || isStreaming} />
        <Text variant="label" tone="muted">
          {/* The model, always: a running tool shows in its own row below, not here too. */}
          {isLoading ? status.label : <ProviderModelLabel provider={provider} model={model} />}
        </Text>
        {isLoading && status.percent !== null && <Progress key={status.label} percent={status.percent} detail={status.detail} size="compact" />}
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
              context={context}
              tokensPerSecond={tokensPerSecond}
              actions={actions}
              meetingCitations={meetingCitations}
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
