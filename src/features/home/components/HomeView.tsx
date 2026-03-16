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
  const { status, selectedHistoryId } = useApp();
  const chat = useChat();

  // Determine what to show based on selections and status
  const hasSelectedChat = chat.currentSessionId !== null;
  const hasSelectedMeeting = selectedHistoryId !== null;

  // Priority order: status takes precedence over selections
  // This ensures clicking "New Chat" (which sets status to IDLE) always shows IdleView
  const showIdleView = status === AppStatus.IDLE;
  const showChatView = status === AppStatus.CHAT && hasSelectedChat;
  const showResultsView = status === AppStatus.RESULTS && hasSelectedMeeting;

  if (showIdleView) {
    return <IdleView />;
  }

  if (showChatView) {
    return <ChatView />;
  }

  if (showResultsView) {
    return <ResultsView />;
  }

  // Default: show IdleView
  return <IdleView />;
};

export default HomeView;
