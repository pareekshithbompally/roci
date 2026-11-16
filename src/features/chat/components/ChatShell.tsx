/** Shared chat layout for ChatView and MeetingChatPopout: messages, composer, citation drawers, speech input. */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useChatStore, useChatActions } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ChatMessage, loadingStatusOf } from './message';
import TodoConfirmationBanner from './TodoConfirmationBanner';
import ToolApprovalBanner from './ToolApprovalBanner';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { MeetingCitationDrawer } from './MeetingCitationDrawer';
import { WebCitationDrawer } from './WebCitationDrawer';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { meetingService } from '@services/meeting.service';
import { useVoiceCapture } from '@features/chat';
import { useContextLimit } from '@features/chat/hooks';
import { useFollowBottom } from '@features/chat/hooks/useFollowBottom';
import { useContextUsage } from '@shared/hooks/useContextUsage';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeetingCitation, WebCitation } from '@shared/types';
import { IconButton, Icon, PageScroll, Text, cn } from '@shared/ui';

const ScrollToBottomBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <IconButton
    icon={ArrowDown}
    label="Scroll to bottom"
    variant="primary"
    onClick={onClick}
    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
  />
);

export interface ChatShellProps {
  emptyStateMessage: string;
  placeholderText: string;
  headerSlot?: React.ReactNode;
  className?: string;
  /** Shared-element id so the composer glides in from the landing page (main chat view only). */
  composerLayoutId?: string;
  /** Messages run to the window top and fade under the titlebar (main chat view, not the side panel). */
  underTitlebar?: boolean;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  emptyStateMessage,
  placeholderText,
  headerSlot,
  className = '',
  composerLayoutId,
  underTitlebar = false,
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
  const replyStatus = useMemo(() => loadingStatusOf(aiActivity), [aiActivity]);
  const chatInput = useChatStore((s) => s.input);
  const copiedMessageId = useChatStore((s) => s.copiedMessageId);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);

  const {
    sendMessage,
    setInput,
    stopGeneration,
    copyMessage,
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

  const showSpeechInput = useSpeechInputReady();

  // One shared voice owner: pill state, second-beat chrome, transcript insert.
  const appendTranscript = useCallback((text: string) => {
    const currentInput = useChatStore.getState().input;
    setInput(currentInput ? `${currentInput} ${text}` : text);
  }, [setInput]);

  const voice = useVoiceCapture({ settings, providers, appendTranscript });

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

  // ── Scroll ──
  // Follow new content only while at the bottom; after scrolling up, offer "jump to bottom" instead.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const showJumpUnlessAtBottom = useCallback((atBottom: boolean) => setShowScrollDown(!atBottom), []);
  const { scrollRef, contentRef, follow, scrollToBottom, onScroll, onWheel } = useFollowBottom(showJumpUnlessAtBottom);

  const handleSend = useCallback(() => {
    // Re-arm follow so the response streams into view below the sent message.
    follow();
    sendMessage();
  }, [follow, sendMessage]);

  // Switching sessions returns to the bottom.
  useEffect(() => {
    scrollToBottom('auto');
  }, [currentSession?.id, scrollToBottom]);

  // ── Message list ──

  const currentMessages = currentSession?.messages || [];

  // Context gauge; hidden when the model limit or usage is unknown.
  const contextLimit = useContextLimit();
  const contextUsage = useContextUsage(currentMessages, contextLimit);

  const isLoadingSession = isSessionLoading && !currentSession;
  const emptyState = (
    <AnimatePresence initial={false}>
      {!voice.isVoiceActive && (
        <motion.div
          key="empty-state"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={voice.chromeEnter}
        >
          <Text as="p" variant="helper" tone="faint">{emptyStateMessage}</Text>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={cn('relative flex h-full w-full flex-col overflow-hidden', className)}>
      {headerSlot}

      {isLoadingSession || currentMessages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          {isLoadingSession ? <Icon icon={Loader2} size="md" tone="faint" className="animate-spin" /> : emptyState}
        </div>
      ) : (
        // Messages fade out at both edges: under the titlebar and into the composer.
        <div className="relative min-h-0 flex-1">
          <PageScroll
            ref={scrollRef}
            onScroll={onScroll}
            onWheel={onWheel}
            underTitlebar={underTitlebar}
            fadeBottom
            className="h-full"
          >
            <div ref={contentRef} role="log" className={`flex flex-col space-y-4 px-4 py-4 ${LAYOUT.chatColumn}`}>
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
                  loadingStatus={message.state === 'loading' ? replyStatus : undefined}
                  tokenCount={message.tokenCount}
                  inputTokenCount={message.inputTokenCount}
                  tokensPerSecond={message.tokensPerSecond}
                  meetingCitations={message.meetingCitations}
                  isCopied={copiedMessageId === message.id}
                  actions={sharedActions}
                  citationHandlers={citationHandlers}
                  webCitations={message.webCitations}
                  inlineCitations={message.inlineCitations}
                  isError={message.isError}
                />
              ))}
            </div>
          </PageScroll>
          {showScrollDown && <ScrollToBottomBtn onClick={() => scrollToBottom()} />}
        </div>
      )}

      {/* Composer */}
      <motion.div
        className={`shrink-0 ${LAYOUT.chatColumn}`}
        layout="position"
        layoutId={composerLayoutId}
        layoutDependency={ANIMATION_CONFIG.chat.composerLayoutDependency.chat}
        transition={ANIMATION_CONFIG.chat.composerGlide}
      >
        <ToolApprovalBanner />
        <TodoConfirmationBanner />
        <ChatInput
          value={chatInput}
          onChange={setInput}
          onSend={handleSend}
          onStop={stopGeneration}
          isLoading={isGenerating}
          contextUsage={contextUsage}
          placeholder={placeholderText}
          availableMeetings={availableMeetings}
          selectedMeetings={selectedMeetingRefs}
          onMeetingSelect={setSelectedMeetingRefs}
          attachments={pendingAttachments}
          onAttach={addAttachment}
          onRemoveAttachment={removeAttachment}
          onScreenshot={addScreenshotAttachment}
          showSpeechInput={showSpeechInput}
          speechState={voice.speech.state}
          micStream={voice.speech.stream}
          liveText={voice.speech.liveText}
          speechElapsed={voice.speech.elapsed}
          onSpeechStart={voice.speech.start}
          onSpeechStop={voice.handleSpeechStop}
          onSpeechTogglePause={voice.speech.togglePause}
          onSpeechCancel={voice.speech.cancel}
        />
      </motion.div>

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
