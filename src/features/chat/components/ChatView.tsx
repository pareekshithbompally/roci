/** Full-screen chat view around ChatShell. */

import React from 'react';
import { ChatShell } from './ChatShell';
import { ANIMATION_CONFIG } from '@config/animations.config';

export const ChatView: React.FC = () => {
  return (
    <ChatShell
      emptyStateMessage="Start a conversation..."
      className="animate-fade-in"
      composerLayoutId={ANIMATION_CONFIG.chat.composerLayoutId}
      underTitlebar
    />
  );
};

export default ChatView;
