import React, { memo } from 'react';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import type { ChatMessageProps } from './types';
import { cn } from '@shared/ui';

export const ChatMessage: React.FC<ChatMessageProps> = memo(({
  message, onSuggestionClick, isLastMessage = false, loadingStatus, isCopied, actions, citationHandlers,
}) => {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {isUser ? (
        <UserMessage message={message} actions={actions} />
      ) : (
        <AssistantMessage
          message={message} onSuggestionClick={onSuggestionClick} isLastMessage={isLastMessage}
          loadingStatus={loadingStatus} isCopied={isCopied} actions={actions} citationHandlers={citationHandlers}
        />
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.message.metadata.state !== next.message.metadata.state) return false;
  // The streaming body re-renders on its own (streamingStore); the message around it holds still.
  if (next.message.metadata.state === 'streaming') return true;
  return (
    prev.message === next.message &&
    prev.loadingStatus === next.loadingStatus &&
    prev.isCopied === next.isCopied &&
    prev.isLastMessage === next.isLastMessage &&
    prev.actions === next.actions &&
    prev.citationHandlers === next.citationHandlers
  );
});

ChatMessage.displayName = 'ChatMessage';
export default ChatMessage;
