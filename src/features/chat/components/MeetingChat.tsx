/** Meeting chat at one corner: a floating ✦ button while closed, the chat window while open (never both). */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { IconButton } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';
import { shortcutLabel } from '@features/shortcuts';
import { useAppActions, useMeetingChatOpen } from '@shared/stores/appStore';
import { MeetingChatPopout } from './MeetingChatPopout';

const { inset } = UI_CONFIG.layout.meetingChat;

/** The same corner the chat window opens from. */
const CORNER: React.CSSProperties = { right: inset, bottom: inset };

interface MeetingChatProps {
  meetingId: string;
  meetingTitle: string;
}

export const MeetingChat: React.FC<MeetingChatProps> = ({ meetingId, meetingTitle }) => {
  const open = useMeetingChatOpen();
  const { setMeetingChatOpen } = useAppActions();

  if (open) return <MeetingChatPopout meetingId={meetingId} meetingTitle={meetingTitle} />;
  return (
    <IconButton
      icon={Sparkles}
      label={`Chat about this meeting (${shortcutLabel('focusChat')})`}
      variant="ai"
      size="fab"
      className="fixed z-floating animate-content-show"
      style={CORNER}
      onClick={() => setMeetingChatOpen(true)}
    />
  );
};
