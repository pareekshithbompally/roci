/** Shared chat layout for ChatView and MeetingChatPopout: messages, composer, citation drawers, speech input. */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { ArrowDown } from 'lucide-react';
import { useChatStore, useCurrentSession } from '@features/chat/stores';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { useMeetingResult } from '@shared/hooks/useMeetingResult';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { ChatMessage, loadingStatusOf } from './message';
import TodoConfirmationBanner from './TodoConfirmationBanner';
import { MemoryConfirmationBanner } from './MemoryConfirmationBanner';
import ToolApprovalBanner from './ToolApprovalBanner';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { MeetingCitationDrawer } from './MeetingCitationDrawer';
import { WebCitationDrawer } from './WebCitationDrawer';
import { useVoiceCapture } from '@features/chat';
import { useChatCost, useContextLimit } from '@features/chat/hooks';
import { useFollowBottom } from '@features/chat/hooks/useFollowBottom';
import { useContextUsage } from '@shared/hooks/useContextUsage';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeetingCitation, WebCitation } from '@shared/types';
import { IconButton, PageScroll, Text, cn } from '@shared/ui';
import { LoadingPane } from '@shared/components';

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
  /** A quiet line in the empty chat; none where the field's own hint says it (the meeting chat). */
  emptyStateMessage?: string;
  /** The field's hint in place of the rotating ones. */
  placeholder?: string;
  /** The meeting this chat is about (the meeting chat window): attached, its chip not repeated in the box. */
  scopeMeetingId?: string;
  headerSlot?: React.ReactNode;
  className?: string;
  /** Shared-element id so the composer glides in from the landing page (main chat view only). */
  composerLayoutId?: string;
  /** Messages run to the window top and fade under the titlebar (main chat view, not the side panel). */
  underTitlebar?: boolean;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  emptyStateMessage,
  placeholder,
  scopeMeetingId,
  headerSlot,
  className = '',
  composerLayoutId,
  underTitlebar = false,
}) => {
  const { settings, providers } = useSettings();
  const app = useAppActions();

  const currentSession = useCurrentSession();
  const isSessionLoading = useChatStore((s) => s.isSessionLoading);
  const isGenerating = useChatStore((s) => s.replyingSessionId !== null);
  const aiActivity = useChatStore((s) => s.aiActivity);
  const replyStatus = useMemo(() => loadingStatusOf(aiActivity), [aiActivity]);
  const chatInput = useChatStore((s) => s.input);
  const copiedMessageId = useChatStore((s) => s.copiedMessageId);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const setInput = useChatStore((s) => s.setInput);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const copyMessage = useChatStore((s) => s.copyMessage);
  const setSelectedMeetingRefs = useChatStore((s) => s.setSelectedMeetingRefs);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);

  // ── Drawer state ──
  const [activeCitation, setActiveCitation] = useState<MeetingCitation | null>(null);
  const [activeMeetingCitations, setActiveMeetingCitations] = useState<MeetingCitation[] | null>(null);
  const [activeWebCitations, setActiveWebCitations] = useState<WebCitation[] | null>(null);

  // A cited meeting is read when its citation is opened: its row, then its transcript and summary.
  const citedId = activeCitation?.meetingId ?? null;
  const citedBrief = useMeetingBrief(citedId);
  const { result: citedResult, loading: citedLoading } = useMeetingResult(citedId);
  const activeMeeting = useMemo(
    () => (citedBrief && citedResult ? { ...citedBrief, transcript: citedResult.transcript, summary: citedResult.summary } : citedBrief),
    [citedBrief, citedResult],
  );

  const handleCitationClick = useCallback((citation: MeetingCitation) => {
    setActiveWebCitations(null);
    setActiveCitation(citation);
  }, []);

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
    if (citedBrief) {
      app.setCurrentView('home');
      app.setSelectedHistoryId(activeCitation.meetingId);
      app.setStatus(AppStatus.RESULTS);
      app.setActiveResultTab('transcript');
    }
    setActiveCitation(null);
    setActiveMeetingCitations(null);
  }, [activeCitation, citedBrief, app]);

  // ── Computed values ──

  const showSpeechInput = useSpeechInputReady();

  // One shared voice owner: pill state, second-beat chrome, transcript insert.
  const appendTranscript = useCallback((text: string) => {
    const currentInput = useChatStore.getState().input;
    setInput(currentInput ? `${currentInput} ${text}` : text);
  }, [setInput]);

  const voice = useVoiceCapture({ settings, providers, appendTranscript });

  // ── Actions ──

  const sharedActions = useMemo<ActionProps>(() => ({ onCopy: copyMessage }), [copyMessage]);

  const citationHandlers = useMemo<CitationHandlers>(
    () => ({
      onCitationClick: handleCitationClick,
      onShowAllMeetingCitations: handleShowAllMeetingCitations,
      onShowAllWebCitations: handleShowAllWebCitations,
    }),
    [handleCitationClick, handleShowAllMeetingCitations, handleShowAllWebCitations]
  );

  // ── Scroll ──
  // Never follows streaming output. A new message (the question, then its reply's placeholder) scrolls into view once;
  // after that the user scrolls freely, with "jump to bottom" whenever they're above the end.
  const [showScrollDown, setShowScrollDown] = useState(false);
  const showJumpUnlessAtBottom = useCallback((atBottom: boolean) => setShowScrollDown(!atBottom), []);
  const { scrollRef, scrollToBottom, onScroll } = useFollowBottom(showJumpUnlessAtBottom);

  const currentMessages = currentSession?.messages || [];
  const sessionId = currentSession?.id;
  const lastMessageId = currentMessages.at(-1)?.id;
  // Empty at mount, so the first anchor lands at the end at once instead of gliding through the history.
  const anchoredSession = useRef<string | undefined>(undefined);

  const handleSend = useCallback(() => sendMessage(), [sendMessage]);

  // Opening a chat lands at its end; a new message in the same chat glides there.
  useEffect(() => {
    const sameSession = anchoredSession.current === sessionId;
    anchoredSession.current = sessionId;
    scrollToBottom(sameSession ? 'smooth' : 'auto');
  }, [sessionId, lastMessageId, scrollToBottom]);

  // ── Message list ──

  // Context gauge; hidden when the model limit or usage is unknown.
  const contextLimit = useContextLimit();
  const contextUsage = useContextUsage(currentMessages, contextLimit);
  const chatCost = useChatCost(currentMessages);

  const isLoadingSession = isSessionLoading && !currentSession;
  const emptyState = (
    <AnimatePresence initial={false}>
      {!voice.isVoiceActive && emptyStateMessage && (
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

      {isLoadingSession ? (
        <LoadingPane />
      ) : currentMessages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">{emptyState}</div>
      ) : (
        // Messages fade out at both edges: under the titlebar and into the composer.
        <div className="relative min-h-0 flex-1">
          <PageScroll
            ref={scrollRef}
            onScroll={onScroll}
            underTitlebar={underTitlebar}
            fadeBottom
            className="h-full"
          >
            <div role="log" className={cn('flex flex-col space-y-4 px-4 py-4', LAYOUT.chatColumn)}>
              {currentMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onSuggestionClick={(suggestion) => sendMessage(suggestion)}
                  isLastMessage={index === currentMessages.length - 1}
                  loadingStatus={message.metadata.state === 'loading' ? replyStatus : undefined}
                  isCopied={copiedMessageId === message.id}
                  actions={sharedActions}
                  citationHandlers={citationHandlers}
                />
              ))}
            </div>
          </PageScroll>
          {showScrollDown && <ScrollToBottomBtn onClick={() => scrollToBottom()} />}
        </div>
      )}

      {/* Composer */}
      <motion.div
        className={cn('shrink-0', LAYOUT.chatColumn)}
        layout="position"
        layoutId={composerLayoutId}
        layoutDependency={ANIMATION_CONFIG.chat.composerLayoutDependency.chat}
        transition={ANIMATION_CONFIG.chat.composerGlide}
      >
        <ToolApprovalBanner />
        <TodoConfirmationBanner chatId={sessionId} />
        <MemoryConfirmationBanner chatId={sessionId} />
        <ChatInput
          value={chatInput}
          onChange={setInput}
          onSend={handleSend}
          onStop={stopGeneration}
          isLoading={isGenerating}
          contextUsage={contextUsage}
          chatCost={chatCost}
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
          placeholder={placeholder}
          scopeMeetingId={scopeMeetingId}
        />
      </motion.div>

      {/* Citation drawers */}
      <MeetingCitationDrawer
        mode={activeCitation ? 'detail' : 'list'}
        citations={activeMeetingCitations}
        activeCitation={activeCitation}
        meeting={activeMeeting}
        isLoading={citedLoading}
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
