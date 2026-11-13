/**
 * ChatShell Component
 *
 * Shared chat layout used by both ChatView (full-screen) and ChatPanel (meeting-scoped).
 * Owns: drawer state, citation handlers, message rendering, ChatInput config,
 * citation drawers, and speech input wiring.
 *
 * ChatView and ChatPanel are thin wrappers that provide only:
 *  - emptyStateMessage, placeholderText, optional headerSlot, optional className
 */

import React, { useMemo, useState, useCallback } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { useChatStore, useChatActions } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ChatMessage } from './message';
import TodoConfirmationBanner from './TodoConfirmationBanner';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { MeetingCitationDrawer } from './MeetingCitationDrawer';
import { WebCitationDrawer } from './WebCitationDrawer';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { meetingService } from '@services/meeting.service';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { useSpeechInput } from '@features/chat';
import { useEngineReady } from '@features/settings/hooks/useEngineReadiness';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import type { MeetingCitation, WebCitation } from '@shared/types';
import { Button } from '@shared/ui';

const ScrollToBottomBtn = () => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button variant="primary" size="icon" onClick={() => scrollToBottom()}>
      <ArrowDown className="w-4 h-4" />
    </Button>
  );
};

export interface ChatShellProps {
  emptyStateMessage: string;
  placeholderText: string;
  headerSlot?: React.ReactNode;
  className?: string;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  emptyStateMessage,
  placeholderText,
  headerSlot,
  className = '',
}) => {
  const { settings, providers } = useSettings();
  const history = useHistoryData();
  const { items: historyItems } = history;
  const app = useAppActions();

  const currentSession = useChatStore((s) =>
    s.currentSessionId ? s.loadedSessions.get(s.currentSessionId) ?? null : null
  );
  const isSessionLoading = useChatStore((s) => s.isSessionLoading);
  const isGenerating = useChatStore((s) => s.isLoading);
  const aiActivity = useChatStore((s) => s.aiActivity);
  const chatInput = useChatStore((s) => s.input);
  const copiedMessageId = useChatStore((s) => s.copiedMessageId);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);

  const {
    sendMessage,
    setInput,
    stopGeneration,
    copyMessage,
    toggleWebSearch,
    setSelectedMeetingRefs,
    addAttachment,
    removeAttachment,
    addScreenshotAttachment,
  } = useChatActions();

  // ── Drawer state ──
  const [activeCitation, setActiveCitation] = useState<MeetingCitation | null>(null);
  const [activeMeetingCitations, setActiveMeetingCitations] = useState<MeetingCitation[] | null>(null);
  const [activeWebCitations, setActiveWebCitations] = useState<WebCitation[] | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);

  const activeMeeting = useMemo(
    () => historyItems.find((h) => h.id === activeCitation?.meetingId) ?? null,
    [historyItems, activeCitation?.meetingId]
  );

  const handleCitationClick = useCallback(
    async (citation: MeetingCitation) => {
      setActiveWebCitations(null);
      setActiveCitation(citation);

      const existing = historyItems.find((h) => h.id === citation.meetingId);
      if (existing && !existing.transcript) {
        setIsHydrating(true);
        try {
          const detail = await meetingService.getMeetingDetail(citation.meetingId);
          if (detail) {
            await history.updateItem(citation.meetingId, {
              transcript: detail.transcript?.text || '',
              summary: detail.summary?.overview || '',
            });
          }
        } catch (err) {
          console.error('[ChatShell] Failed to hydrate meeting citation:', err);
        } finally {
          setIsHydrating(false);
        }
      }
    },
    [historyItems, history]
  );

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
    const item = historyItems.find((h) => h.id === activeCitation.meetingId);
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

  // ── Computed values ──

  const availableMeetings = useMemo(
    () => meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  const showWebSearch = useMemo(() => {
    for (const provider of providers) {
      if (!provider.active) continue;
      const model = provider.models?.find((m) => m.id === settings.chatModel);
      if (model) return supportsWebSearch(provider.provider);
    }
    return false;
  }, [settings.chatModel, providers]);

  const showSpeechInput = useEngineReady(settings.transcriptionModel);

  const speech = useSpeechInput(settings, providers);

  const handleSpeechStop = useCallback(async () => {
    const text = await speech.stop();
    if (text) {
      const currentInput = useChatStore.getState().input;
      setInput(currentInput ? `${currentInput} ${text}` : text);
    }
  }, [speech, setInput]);

  // ── Actions ──

  const sharedActions = useMemo<ActionProps>(
    () => ({
      onCopy: copyMessage,
      onRerun: () => {
        useChatStore.getState().rerunLastMessage();
      },
    }),
    [copyMessage]
  );

  const citationHandlers = useMemo<CitationHandlers>(
    () => ({
      onCitationClick: handleCitationClick,
      onShowAllMeetingCitations: handleShowAllMeetingCitations,
      onShowAllWebCitations: handleShowAllWebCitations,
    }),
    [handleCitationClick, handleShowAllMeetingCitations, handleShowAllWebCitations]
  );

  const handleSend = useCallback(() => {
    sendMessage();
  }, [sendMessage]);

  // ── Message list ──

  const currentMessages = currentSession?.messages || [];

  return (
    <div className={`h-full w-full ${className}`}>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header slot (ChatPanel header bar) */}
        {headerSlot}

        {/* Messages Area */}
        {isSessionLoading && !currentSession ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--text-faint)]" />
          </div>
        ) : currentMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
              {emptyStateMessage}
            </p>
          </div>
        ) : (
          <StickToBottom
            className="relative flex-1 overflow-y-hidden"
            initial="smooth"
            resize="smooth"
            role="log"
          >
            <StickToBottom.Content
              className={`flex flex-col ${TYPOGRAPHY_CLASSES.chatSpacing} ${TYPOGRAPHY_CLASSES.chatContainer}`}
            >
              {currentMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  role={message.role}
                  text={message.text}
                  parts={message.parts}
                  meetingRefs={message.meetingRefs}
                  timestamp={message.timestamp}
                  suggestions={message.suggestions}
                  onSuggestionClick={(suggestion) => sendMessage(suggestion)}
                  isLastMessage={index === currentMessages.length - 1}
                  provider={message.provider}
                  model={message.model}
                  state={message.state}
                  loadingLabel={
                    message.state === 'loading' && aiActivity?.isSearching
                      ? 'Searching the web…'
                      : undefined
                  }
                  tokenCount={message.tokenCount}
                  inputTokenCount={message.inputTokenCount}
                  tokensPerSecond={message.tokensPerSecond}
                  toolActivity={message.toolActivity}
                  meetingCitations={message.meetingCitations}
                  isCopied={copiedMessageId === message.id}
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

        {/* Input Area */}
        <div className="shrink-0">
          <TodoConfirmationBanner />
          <ChatInput
            value={chatInput}
            onChange={setInput}
            onSend={handleSend}
            onStop={stopGeneration}
            isLoading={isGenerating}
            placeholder={placeholderText}
            availableMeetings={availableMeetings}
            selectedMeetings={selectedMeetingRefs}
            onMeetingSelect={setSelectedMeetingRefs}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={toggleWebSearch}
            showWebSearch={showWebSearch}
            attachments={pendingAttachments}
            onAttach={addAttachment}
            onRemoveAttachment={removeAttachment}
            onScreenshot={addScreenshotAttachment}
            showSpeechInput={showSpeechInput}
            speechState={speech.state}
            micStream={speech.stream}
            speechElapsed={speech.elapsed}
            onSpeechStart={speech.start}
            onSpeechStop={handleSpeechStop}
            onSpeechCancel={speech.cancel}
          />
        </div>
      </div>

      {/* Citation drawers */}
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
      <WebCitationDrawer citations={activeWebCitations} onClose={handleWebDrawerClose} />
    </div>
  );
};

export default ChatShell;
