/** Home view switched on app status; with Live Transcript on, the record screen owns it while recording. */

import React from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { motionFor } from '@shared/ui';
import { useAppStatus, useSelectedHistoryId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ChatView, useChatCurrentSessionId } from '@features/chat';
import { RecordingMeetingView, useRecordingScreenMeetingId } from '@features/recording';
import { IdleView } from './IdleView';
import { ResultsView } from './ResultsView';

/** Record screen exit: a fade out. */
const VIEW = ANIMATION_CONFIG.view;

export const HomeView: React.FC = () => {
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const recordingScreenMeetingId = useRecordingScreenMeetingId();

  // Determine what to show based on selections and status
  const hasSelectedChat = useChatCurrentSessionId() !== null;
  const hasSelectedMeeting = selectedHistoryId !== null;

  // A recording owns the home column with its record screen (`useRecordingScreenMeetingId` says when).
  const showRecordingView = recordingScreenMeetingId !== null;
  // Status takes precedence over selections: "New Chat" sets IDLE, which shows IdleView
  const showChatView = status === AppStatus.CHAT && hasSelectedChat;
  const showResultsView = status === AppStatus.RESULTS && hasSelectedMeeting;

  // Only the record screen fades out; chat/idle/results swap as today so the composer glide stays intact.

  // LayoutGroup lets the composer glide from IdleView to ChatView (shared layoutId).
  return (
    <LayoutGroup>
      <AnimatePresence mode="wait" initial={false}>
        {showRecordingView ? (
          <motion.div
            key="recording"
            className="flex-1 flex flex-col min-h-0"
            exit={VIEW.hidden}
            transition={motionFor(VIEW.exit)}
          >
            <RecordingMeetingView />
          </motion.div>
        ) : (
          <React.Fragment key="main">
            {showChatView ? <ChatView /> : showResultsView ? <ResultsView /> : <IdleView />}
          </React.Fragment>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
};

export default HomeView;
