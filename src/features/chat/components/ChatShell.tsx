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

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useChatStore, useChatActions } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ChatMessage } from './message';
import TodoConfirmationBanner from './TodoConfirmationBanner';
import ToolApprovalBanner from './ToolApprovalBanner';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { MeetingCitationDrawer } from './MeetingCitationDrawer';
import { WebCitationDrawer } from './WebCitationDrawer';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { meetingService } from '@services/meeting.service';
import { useVoiceCapture } from '@features/chat';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeetingCitation, WebCitation } from '@shared/types';
import { IconButton, Icon, Text } from '@shared/ui';

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
}

export const ChatShell: React.FC<ChatShellProps> = ({
  emptyStateMessage,
  placeholderText,
  headerSlot,
  className = '',
  composerLayoutId,
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

  const handleSend = useCallback(() => {
    // Re-arm follow so the response streams into view below the sent message.
    followRef.current = true;
    sendMessage();
  }, [sendMessage]);

  // ── Scroll ──
  // Manual scroll container: follow new content only while the user is at the
  // bottom; once they scroll up, stop yanking and offer a "jump to bottom"
  // button instead. Replaces auto-stick (StickToBottom), which fought the user.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const followRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    followRef.current = true;
    setShowScrollDown(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setShowScrollDown(!atBottom);
    if (atBottom) followRef.current = true;
  }, []);

  // Scrolling up breaks follow; the user stays put while content grows below.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY < 0) followRef.current = false;
  }, []);

  // Follow new content (streaming growth, new messages) while stuck to bottom.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (followRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // Switching sessions returns to the bottom.
  useEffect(() => {
    followRef.current = true;
    scrollToBottom('auto');
  }, [currentSession?.id, scrollToBottom]);

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
            <Icon icon={Loader2} size="md" tone="faint" className="animate-spin" />
          </div>
        ) : currentMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
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
          </div>
        ) : (
          <div className="relative flex-1 min-h-0">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              onWheel={handleWheel}
              className={`h-full overflow-y-auto ${voice.isVoiceActive ? '[-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-64px),transparent)] [mask-image:linear-gradient(to_bottom,black_calc(100%-64px),transparent)]' : ''}`}
            >
              <div
                ref={contentRef}
                role="log"
                className={`flex flex-col space-y-4 px-4 py-4 ${LAYOUT.chatColumn}`}
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
              </div>
            </div>
            {showScrollDown && <ScrollToBottomBtn onClick={() => scrollToBottom()} />}
          </div>
        )}

        {/* Input Area */}
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
            speechElapsed={voice.speech.elapsed}
            onSpeechStart={voice.speech.start}
            onSpeechStop={voice.handleSpeechStop}
            onSpeechTogglePause={voice.speech.togglePause}
            onSpeechCancel={voice.speech.cancel}
          />
        </motion.div>
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
