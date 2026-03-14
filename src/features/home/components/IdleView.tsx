/**
 * IdleView Component
 * 
 * Landing page when app is idle - shows main action buttons and chat composer.
 * Uses shared ChatInput component for consistent chat experience.
 */

import React, { useMemo, useState } from 'react';
import { Sparkles, AudioWaveform } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { useRecordingContext } from '@features/recording';
import { useChat } from '@shared/contexts/ChatContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ChatInput } from '@features/chat';
import { meetingReferenceService } from '@/services/meetingReferenceService';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';

interface IdleViewProps {
  onChatToggle: () => void;
  isChatOpen: boolean;
}

const GREETING_POOL = [
  'Ready to explore some new ideas?',
  'What\u2019s on your mind today?',
  'Let\u2019s dive into something new!',
  'What shall we discover right now?',
  'Tell me what you\u2019re seeking',
  'Where would you like to start?',
  'I\u2019m listening, go ahead!',
  'Ready when you are!',
  'How can I help?',
];

export const IdleView: React.FC<IdleViewProps> = ({ onChatToggle, isChatOpen }) => {
  const { isDark } = useTheme();
  const { setStatus } = useApp();
  const [greeting] = useState(() => GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)]);
  const recording = useRecordingContext();
  // Chat functionality - shared with ChatPanel/ChatView
  const chat = useChat();
  const { items: historyItems } = useHistory();
  const { settings, providers } = useSettings();

  // Get available meetings for @ mention
  const availableMeetings = useMemo(() => 
    meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  // Check if current model supports web search
  const showWebSearch = useMemo(() => {
    // Find the provider for this model
    for (const provider of providers) {
      if (!provider.active) continue;
      const model = provider.models?.find(m => m.id === settings.chatModel);
      if (model) {
        return supportsWebSearch(provider.provider);
      }
    }
    return false;
  }, [settings.chatModel, providers]);

  const handleStartRecording = async () => {
    try {
      await recording.startRecording();
    } catch (error) {
      // Error already handled in RecordingContext with toast
      console.error('[IdleView] Failed to start recording:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!chat.input.trim() || chat.isLoading) return;
    
    // Capture the input before clearing
    const messageText = chat.input;
    
    // Clear any existing session to start fresh
    chat.newChat();
    
    // Switch to CHAT view immediately for smooth transition
    setStatus(AppStatus.CHAT);
    
    // Send the message with the captured text (this runs async, ChatView shows loading state)
    chat.sendMessage(messageText, historyItems, settings, providers);
  };

  return (
    <div className="flex-1 w-full flex flex-col animate-fade-in relative">
      
      {/* Chat Composer - Centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-2 relative z-20">
        <div className="w-full max-w-3xl space-y-6 overflow-visible">
          {/* Greeting */}
          <h1 className={`text-2xl md:text-3xl font-medium text-center ${TEXT.heading}`}>
            {greeting}
          </h1>
          {/* Shared ChatInput component - same as ChatPanel/ChatView */}
          <ChatInput
            value={chat.input}
            onChange={chat.setInput}
            onSend={handleSendMessage}
            isLoading={chat.isLoading}
            placeholder="Type @ to add meeting context..."
            availableMeetings={availableMeetings}
            selectedMeetings={chat.selectedMeetingRefs}
            onMeetingSelect={chat.setSelectedMeetingRefs}
            webSearchEnabled={chat.webSearchEnabled}
            onWebSearchToggle={chat.toggleWebSearch}
            showWebSearch={showWebSearch}
            attachments={chat.pendingAttachments}
            onAttach={chat.addAttachment}
            onRemoveAttachment={chat.removeAttachment}
            onScreenshot={chat.addScreenshotAttachment}
          />

          {/* Action Chips - Horizontal Row */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={handleStartRecording}
              disabled={!recording.canRecord}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 border border-red-600/50 dark:border-red-700/50 rounded-full text-sm font-medium text-white hover:shadow-lg hover:shadow-red-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AudioWaveform className="w-4 h-4" />
              <span>Record</span>
            </button>

            <button
              onClick={onChatToggle}
              className={`inline-flex items-center gap-2 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} ${SURFACE.hoverSubtle} transition-all`}
            >
              <Sparkles className="w-4 h-4" />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>

      {/* Illustration - Bottom Right Corner, inside borders */}
      <div className="absolute bottom-2 right-2 pointer-events-none select-none z-0">
        <img
          src="https://illustrations.popsy.co/amber/home-office.svg"
          alt="Voice AI Workflow"
          className="w-full max-w-[280px]"
          style={
            isDark
              ? { filter: 'invert(1) hue-rotate(175deg) brightness(1.1) contrast(0.9)' }
              : {}
          }
        />
      </div>

    </div>
  );
};

export default IdleView;
