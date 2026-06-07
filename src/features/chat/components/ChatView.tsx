/**
 * ChatView Component
 *
 * Full-screen chat view for main layout. Thin wrapper around ChatShell.
 */

import React from 'react';
import { ChatShell } from './ChatShell';

export const ChatView: React.FC = () => {
  return (
    <ChatShell
      emptyStateMessage="Start a conversation..."
      placeholderText="Type @ to add meeting context..."
      className="animate-chat-settle"
    />
  );
};

export default ChatView;
