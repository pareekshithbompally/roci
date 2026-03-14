/**
 * ChatView Component
 *
 * Full-screen chat view for main layout (separate from right sidebar chat).
 * This is for messages initiated from IdleView chat composer.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { useChat } from '@shared/contexts/ChatContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { ChatMessage } from './message';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { MeetingCitationDrawer } from './MeetingCitationDrawer';
import { WebCitationDrawer } from './WebCitationDrawer';
import { meetingReferenceService } from '@/services/meetingReferenceService';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { COMPONENT, TEXT } from '@config/theme.config';
import type { MeetingCitation, WebCitation } from '@/types';

const ScrollToBottomBtn = () => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      onClick={() => scrollToBottom()}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 ${COMPONENT.floatingButton}`}
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  );
};

export const ChatView: React.FC = () => {
  const chat = useChat();
  const { settings, providers } = useSettings();
  const { items: historyItems } = useHistory();
  const app = useApp();

  // Drawer state — only one drawer open at a time
  const [activeCitation, setActiveCitation] = useState<MeetingCitation | null>(null);
  const [activeWebCitations, setActiveWebCitations] = useState<WebCitation[] | null>(null);
  const activeMeeting = useMemo(
    () => historyItems.find(h => h.id === activeCitation?.meetingId) ?? null,
    [historyItems, activeCitation?.meetingId]
  );
  const handleCitationClick = useCallback((citation: MeetingCitation) => {
    setActiveWebCitations(null);
    setActiveCitation(citation);
  }, []);
  const handleShowAllWebCitations = useCallback((citations: WebCitation[]) => {
    setActiveCitation(null);
    setActiveWebCitations(citations);
  }, []);
  const handleDrawerClose = useCallback(() => {
    setActiveCitation(null);
  }, []);
  const handleWebDrawerClose = useCallback(() => {
    setActiveWebCitations(null);
  }, []);
  const handleOpenInMain = useCallback(() => {
    if (!activeCitation) return;
    const item = historyItems.find(h => h.id === activeCitation.meetingId);
    if (item) {
      app.setCurrentView('home');
      app.setResult(item);
      app.setSelectedHistoryId(activeCitation.meetingId);
      app.setStatus(AppStatus.RESULTS);
      app.setActiveResultTab('transcript');
    }
    setActiveCitation(null);
  }, [activeCitation, historyItems, app]);

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

  const sharedActions = useMemo<ActionProps>(() => ({
    onCopy: chat.copyMessage,
    onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
  }), [chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);

  const citationHandlers = useMemo<CitationHandlers>(() => ({
    onCitationClick: handleCitationClick,
    onShowAllWebCitations: handleShowAllWebCitations,
  }), [handleCitationClick, handleShowAllWebCitations]);

  const currentMessages = chat.currentSession?.messages || [];

  return (
    <div className="h-full w-full">
      {/* Chat column — messages + input, clipped to prevent scroll bleed */}
      <div className="h-full flex flex-col overflow-hidden">
        {/* Messages Area — StickToBottom for smooth auto-scroll */}
        {currentMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>Start a conversation...</p>
          </div>
        ) : (
          <StickToBottom className="relative flex-1 overflow-y-hidden" initial="smooth" resize="smooth" role="log">
            <StickToBottom.Content className={`flex flex-col ${TYPOGRAPHY_CLASSES.chatSpacing} ${TYPOGRAPHY_CLASSES.chatContainer}`}>
              {currentMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  text={message.text}
                  parts={message.parts}
                  timestamp={message.timestamp}
                  suggestions={message.suggestions}
                  onSuggestionClick={(suggestion) => chat.sendMessage(suggestion, historyItems, settings, providers)}
                  isLastMessage={index === currentMessages.length - 1}
                  provider={message.provider}
                  model={message.model}
                  state={message.state}
                  tokenCount={message.tokenCount}
                  tokensPerSecond={message.tokensPerSecond}
                  toolActivity={message.toolActivity}
                  meetingCitations={message.meetingCitations}
                  isCopied={chat.copiedMessageId === message.id}
                  actions={sharedActions}
                  citationHandlers={citationHandlers}
                  webCitations={message.webCitations}
                  inlineCitations={message.inlineCitations}
                />
              ))}
            </StickToBottom.Content>
            <ScrollToBottomBtn />
          </StickToBottom>
        )}

        {/* Input Area - Fixed at Bottom */}
        <div className="shrink-0">
          <ChatInput
            value={chat.input}
            onChange={chat.setInput}
            onSend={() => chat.sendMessage(undefined, historyItems, settings, providers)}
            onStop={chat.stopGeneration}
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
        </div>
      </div>

      {/* Slide-in citation drawers — outside overflow-hidden so they're not clipped */}
      <MeetingCitationDrawer
        citation={activeCitation}
        meeting={activeMeeting}
        onClose={handleDrawerClose}
        onOpenInMain={handleOpenInMain}
      />
      <WebCitationDrawer
        citations={activeWebCitations}
        onClose={handleWebDrawerClose}
      />
    </div>
  );
};

export default ChatView;
