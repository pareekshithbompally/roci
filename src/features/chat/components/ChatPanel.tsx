/**
 * ChatPanel Component
 *
 * Meeting-scoped chat panel. Renders alongside ResultsView when user clicks "AI Chat".
 * Auto-attaches the viewed meeting as @ context.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { X, ArrowDown } from 'lucide-react';
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
import { meetingService } from '@/services/meeting.service';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
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

interface ChatPanelProps {
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ meetingId, meetingTitle, onClose }) => {
  const chat = useChat();
  const { settings, providers } = useSettings();
  const history = useHistory();
  const { items: historyItems } = history;
  const app = useApp();

  // Drawer state — only one drawer open at a time
  const [activeCitation, setActiveCitation] = useState<MeetingCitation | null>(null);
  const [activeMeetingCitations, setActiveMeetingCitations] = useState<MeetingCitation[] | null>(null);
  const [activeWebCitations, setActiveWebCitations] = useState<WebCitation[] | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);

  const activeMeeting = useMemo(
    () => historyItems.find(h => h.id === activeCitation?.meetingId) ?? null,
    [historyItems, activeCitation?.meetingId]
  );

  // On mount or meetingId change: get or create a session for this meeting
  useEffect(() => {
    chat.getOrCreateMeetingSession(meetingId, meetingTitle);

    // Auto-set the meeting as @ context
    const meetingRef = meetingReferenceService.getRecentMeetings(historyItems, 50)
      .find(m => m.id === meetingId);
    if (meetingRef) {
      chat.setSelectedMeetingRefs([meetingRef]);
    }
  }, [meetingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCitationClick = useCallback(async (citation: MeetingCitation) => {
    setActiveWebCitations(null);
    setActiveCitation(citation);

    // Hydrate meeting data if missing transcript
    const existing = historyItems.find(h => h.id === citation.meetingId);
    if (existing && !existing.transcript) {
      setIsHydrating(true);
      try {
        const detail = await meetingService.getMeetingDetail(citation.meetingId);
        if (detail) {
          await history.updateItem(citation.meetingId, {
            transcript: detail.transcript?.text || '',
            summary: detail.summary?.overview || ''
          });
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to hydrate meeting citation:', err);
      } finally {
        setIsHydrating(false);
      }
    }
  }, [historyItems, history]);

  const handleShowAllMeetingCitations = useCallback((citations: MeetingCitation[]) => {
    setActiveCitation(null);
    setActiveWebCitations(null);
    setActiveMeetingCitations(citations);
  }, []);

  const handleShowAllWebCitations = useCallback((citations: WebCitation[]) => {
    setActiveCitation(null);
    setActiveMeetingCitations(null);
    setActiveWebCitations(citations);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setActiveCitation(null);
    setActiveMeetingCitations(null);
  }, []);

  const handleDrawerBack = useCallback(() => {
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
    setActiveMeetingCitations(null);
  }, [activeCitation, historyItems, app]);

  const sharedActions = useMemo<ActionProps>(() => ({
    onCopy: chat.copyMessage,
    onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
  }), [chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);

  const citationHandlers = useMemo<CitationHandlers>(() => ({
    onCitationClick: handleCitationClick,
    onShowAllMeetingCitations: handleShowAllMeetingCitations,
    onShowAllWebCitations: handleShowAllWebCitations,
  }), [handleCitationClick, handleShowAllMeetingCitations, handleShowAllWebCitations]);

  // Get available meetings for @ mention
  const availableMeetings = useMemo(() =>
    meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  // Check if current model supports web search
  const showWebSearch = useMemo(() => {
    const resolved = supportsWebSearch(settings.chatModel);
    if (!resolved) return false;

    for (const provider of providers) {
      if (!provider.active) continue;
      const model = provider.models?.find(m => m.id === settings.chatModel);
      if (model) {
        return supportsWebSearch(provider.provider);
      }
    }
    return false;
  }, [settings.chatModel, providers]);

  const currentMessages = chat.currentSession?.messages || [];
  const showEmptyState = currentMessages.length === 0;

  return (
    <div className={`w-full h-full border-l ${BORDER.default} ${SURFACE.chatPanel} flex flex-col shadow-xl`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${BORDER.default} h-14 shrink-0`}>
        <h2 className={`font-semibold text-sm ${TEXT.primary} truncate`}>
          {meetingTitle}
        </h2>
        <button
          onClick={onClose}
          className={`p-2 ${SURFACE.hoverSubtle} rounded-lg transition-colors shrink-0`}
          title="Close"
        >
          <X className={`w-4 h-4 ${TEXT.muted}`} />
        </button>
      </div>

      {/* Content */}
      {showEmptyState ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className={`text-sm ${TEXT.muted}`}>Ask about this meeting...</p>
        </div>
      ) : (
        <StickToBottom className="relative flex-1 overflow-y-hidden" initial="smooth" resize="smooth" role="log">
          <StickToBottom.Content className="flex flex-col gap-4 px-2 py-4">
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
                isError={message.isError}
              />
            ))}
          </StickToBottom.Content>
          <ScrollToBottomBtn />
        </StickToBottom>
      )}

      {/* Input */}
      <ChatInput
        value={chat.input}
        onChange={chat.setInput}
        onSend={() => chat.sendMessage(undefined, historyItems, settings, providers)}
        onStop={chat.stopGeneration}
        isLoading={chat.isLoading}
        placeholder="Ask about this meeting..."
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
      {/* Slide-in citation drawers */}
      <MeetingCitationDrawer
        mode={activeCitation ? 'detail' : 'list'}
        citations={activeMeetingCitations}
        activeCitation={activeCitation}
        meeting={activeMeeting}
        isLoading={isHydrating}
        onClose={handleDrawerClose}
        onCitationClick={handleCitationClick}
        onBack={handleDrawerBack}
        onOpenInMain={handleOpenInMain}
      />
      <WebCitationDrawer
        citations={activeWebCitations}
        onClose={handleWebDrawerClose}
      />
    </div>
  );
};

export default ChatPanel;
