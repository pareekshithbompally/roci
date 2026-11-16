import React, { memo } from 'react';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import type { ChatMessageProps } from './types';

export const ChatMessage: React.FC<ChatMessageProps> = memo(({
  id, role, text, parts, meetingRefs, timestamp, suggestions, onSuggestionClick,
  isLastMessage = false, provider, model,
  state = 'complete', loadingStatus, tokenCount, inputTokenCount, tokensPerSecond,
  meetingCitations,
  isCopied, actions, citationHandlers,
  webCitations, inlineCitations, isError,
}) => {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser ? (
        <UserMessage id={id} text={text} parts={parts} meetingRefs={meetingRefs} timestamp={timestamp} isCopied={isCopied} actions={actions} />
      ) : (
        <AssistantMessage
          id={id} text={text} parts={parts} timestamp={timestamp}
          suggestions={suggestions} onSuggestionClick={onSuggestionClick}
          isLastMessage={isLastMessage} provider={provider} model={model}
          state={state} loadingStatus={loadingStatus}
          tokenCount={tokenCount} inputTokenCount={inputTokenCount} tokensPerSecond={tokensPerSecond}
          meetingCitations={meetingCitations}
          isCopied={isCopied} actions={actions} citationHandlers={citationHandlers}
          webCitations={webCitations} inlineCitations={inlineCitations}
          isError={isError}
        />
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.state !== next.state) return false;
  if (next.state === 'streaming') return true;
  return (
    prev.id === next.id &&
    prev.text === next.text &&
    prev.parts === next.parts &&
    prev.meetingRefs === next.meetingRefs &&
    prev.loadingStatus === next.loadingStatus &&
    prev.isCopied === next.isCopied &&
    prev.isLastMessage === next.isLastMessage &&
    prev.suggestions === next.suggestions &&
    prev.tokenCount === next.tokenCount &&
    prev.inputTokenCount === next.inputTokenCount &&
    prev.tokensPerSecond === next.tokensPerSecond &&
    prev.meetingCitations === next.meetingCitations &&
    prev.actions === next.actions &&
    prev.citationHandlers === next.citationHandlers &&
    prev.webCitations === next.webCitations &&
    prev.inlineCitations === next.inlineCitations &&
    prev.isError === next.isError
  );
});

ChatMessage.displayName = 'ChatMessage';
export default ChatMessage;
