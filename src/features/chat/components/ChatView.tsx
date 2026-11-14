/**
 * ChatView Component
 *
 * Full-screen chat view for main layout. Thin wrapper around ChatShell.
 */

import React from 'react';
import { ChatShell } from './ChatShell';
import { ANIMATION_CONFIG } from '@config/animations.config';

export const ChatView: React.FC = () => {
  return (
    <ChatShell
      emptyStateMessage="Start a conversation..."
      placeholderText="Type @ to add meeting context..."
      className="animate-fade-in"
      composerLayoutId={ANIMATION_CONFIG.chat.composerLayoutId}
    />
  );
};

export default ChatView;
