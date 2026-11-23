import React, { memo, useMemo, useRef } from 'react';
import { AnimatedProviderIcon } from '@features/chat/components/AnimatedProviderIcon';
import { useStreamingMessage } from '@features/chat/stores/streamingStore';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { useModelLabel } from '@shared/hooks/useModelLabel';
import { GlyphSlot, ICON_SIZE_PX, Progress, Text } from '@shared/ui';
import { useReadAloud } from '@shared/hooks/useReadAloud';
import { useSpeechHighlight } from '@shared/hooks/useSpeechHighlight';
import { meetingCitationsOf, messageText, webCitationsOf } from '@shared/utils/chatParts';
import PartsList from './PartsList';
import { loadingStatusOf } from './loadingStatus';
import { useReplyCost } from '@features/chat/hooks/useChatCost';
import AssistantActionBar from './AssistantActionBar';
import ErrorMessageBox from './ErrorMessageBox';
import type { AssistantMessageProps } from './types';
import type { ChatPart } from '@shared/types';

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

/** The message's parts, live while it streams and saved once it's done, through one list: a tool's image or screen keeps
 *  its place when the reply finishes instead of being rebuilt. Isolated so only it re-renders on each chunk. */
interface MessagePartsProps {
  msgId: string;
  parts: ChatPart[];
  streaming: boolean;
  onSend?: (text: string) => void;
}

const MessageParts = memo(({ msgId, parts, streaming, onSend }: MessagePartsProps) => {
  const live = useStreamingMessage(streaming ? msgId : null);
  return <PartsList parts={live ? live.parts : parts} messageId={msgId} streaming={!!live} generation={live?.generation} onSend={onSend} />;
});

MessageParts.displayName = 'MessageParts';

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message, onSuggestionClick, isLastMessage, loadingStatus, isCopied, actions, citationHandlers,
}) => {
  const { id, parts, metadata } = message;
  const { provider, model, state = 'complete', isError, context, tokensPerSecond, usage, suggestions, createdAt } = metadata;
  const text = useMemo(() => messageText({ parts }), [parts]);
  const meetingCitations = useMemo(() => meetingCitationsOf(parts), [parts]);
  const webCitations = useMemo(() => webCitationsOf(parts), [parts]);
  const cost = useReplyCost({ provider, model, usage });
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
        <GlyphSlot><AnimatedProviderIcon provider={provider || 'unknown'} modelId={model} size={ICON_SIZE_PX.sm} isAnimating={isLoading || isStreaming} /></GlyphSlot>
        <Text variant="helper" tone="muted">
          {/* The model, always: a running tool shows in its own row below, not here too. */}
          {isLoading ? status.label : <ProviderModelLabel provider={provider} model={model} />}
        </Text>
        {isLoading && status.percent !== null && <Progress key={status.label} percent={status.percent} detail={status.detail} size="compact" />}
      </div>

      {/* STREAMING or COMPLETE STATE */}
      {(isStreaming || isComplete) && (
        <>
          {/* Message Content */}
          {/* The reply's parts (its work, its text, a tool's view) one gap apart. */}
          <div ref={bodyRef} className="relative flex flex-col gap-2">
            {!isStreaming && isError && text ? (
              <ErrorMessageBox errorText={text} />
            ) : (
              <MessageParts msgId={id} parts={parts} streaming={isStreaming} onSend={onSuggestionClick} />
            )}
          </div>

          {/* Action Bar — only when complete */}
          {isComplete && text && (
            <AssistantActionBar
              id={id}
              text={text}
              timestamp={createdAt}
              isLastMessage={isLastMessage}
              isCopied={isCopied}
              context={context}
              tokensPerSecond={tokensPerSecond}
              cost={cost}
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
