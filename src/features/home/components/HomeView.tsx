/** Home view switched on app status; the recording UI lives in ActivityTray instead. */

import React from 'react';
import { LayoutGroup } from 'framer-motion';
import { useAppStatus, useSelectedHistoryId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useChat } from '@shared/contexts/ChatContext';
import { ChatView } from '@features/chat';
import { IdleView } from './IdleView';
import { ResultsView } from './ResultsView';

export const HomeView: React.FC = () => {
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const chat = useChat();

  // Determine what to show based on selections and status
  const hasSelectedChat = chat.currentSessionId !== null;
  const hasSelectedMeeting = selectedHistoryId !== null;

  // Status takes precedence over selections: "New Chat" sets IDLE, which shows IdleView
  const showChatView = status === AppStatus.CHAT && hasSelectedChat;
  const showResultsView = status === AppStatus.RESULTS && hasSelectedMeeting;

  // LayoutGroup lets the composer glide from IdleView to ChatView (shared layoutId).
  const view = showChatView ? <ChatView /> : showResultsView ? <ResultsView /> : <IdleView />;
  return <LayoutGroup>{view}</LayoutGroup>;
};

export default HomeView;
