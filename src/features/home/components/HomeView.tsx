/**
 * HomeView Component
 * 
 * Main home view that renders different states based on app status.
 * Recording UI is handled by RecordingWidget (global overlay).
 */

import React from 'react';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { ChatView } from '@features/chat';
import { IdleView } from './IdleView';
import { ResultsView } from './ResultsView';

export const HomeView: React.FC = () => {
  const { status, toggleChat, isChatOpen, selectedHistoryId } = useApp();
  const chat = useChat();

  // Determine what to show based on selections and status
  const hasSelectedChat = chat.currentSessionId !== null;
  const hasSelectedMeeting = selectedHistoryId !== null;
  
  // Priority order: status takes precedence over selections
  // This ensures clicking "New Chat" (which sets status to IDLE) always shows IdleView
  const showIdleView = status === AppStatus.IDLE;
  const showChatView = status === AppStatus.CHAT && hasSelectedChat;
  const showResultsView = status === AppStatus.RESULTS && hasSelectedMeeting;

  // IdleView renders outside the constrained wrapper for proper centering
  if (showIdleView) {
    return <IdleView onChatToggle={toggleChat} isChatOpen={isChatOpen} />;
  }

  // ChatView also renders outside the constrained wrapper for full-width native feel
  if (showChatView) {
    return <ChatView />;
  }

  // ResultsView also renders outside the constrained wrapper for edge-to-edge native feel
  if (showResultsView) {
    return <ResultsView />;
  }

  // Default: show IdleView
  return <IdleView onChatToggle={toggleChat} isChatOpen={isChatOpen} />;
};

export default HomeView;
