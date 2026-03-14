/**
 * ChatPanel Component
 * 
 * Complete chat panel with messages, input, and history view.
 */

import React, { useMemo, useCallback } from 'react';
import { X, History, ArrowLeft, ArrowDown, MessageSquarePlus } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { useChat } from '@shared/contexts/ChatContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { ChatMessage } from './message';
import type { ActionProps, CitationHandlers } from './message';
import { ChatInput } from './ChatInput';
import { ChatHistoryList } from './ChatHistoryList';
import { meetingReferenceService } from '@/services/meetingReferenceService';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { MeetingCitation } from '@/types';

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
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const chat = useChat();
  const { settings, providers } = useSettings();
  const { items: historyItems } = useHistory();
  const app = useApp();

  const handleCitationClick = useCallback((citation: MeetingCitation) => {
    const item = historyItems.find(h => h.id === citation.meetingId);
    if (item) {
      app.setCurrentView('home');
      app.setResult(item);
      app.setSelectedHistoryId(citation.meetingId);
      app.setStatus(AppStatus.RESULTS);
      app.setActiveResultTab('transcript');
    }
    onClose();
  }, [historyItems, app, onClose]);

  const sharedActions = useMemo<ActionProps>(() => ({
    onCopy: chat.copyMessage,
    onRerun: () => chat.rerunLastMessage(historyItems, settings, providers),
  }), [chat.copyMessage, chat.rerunLastMessage, historyItems, settings, providers]);

  const citationHandlers = useMemo<CitationHandlers>(() => ({
    onCitationClick: handleCitationClick,
  }), [handleCitationClick]);

  // Get available meetings for @ mention
  const availableMeetings = useMemo(() => 
    meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  // Check if current model supports web search
  const showWebSearch = useMemo(() => {
    const resolved = supportsWebSearch(settings.chatModel);
    if (!resolved) return false;
    
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

  // Generate suggested prompts based on history
  const getSuggestedPrompts = () => {
    if (historyItems.length > 0) {
      const last = historyItems[0];
      return [
        `Summarize "${last.title}"`,
        `What were the key takeaways from "${last.title}"?`,
        `Draft a follow-up email for "${last.title}"`,
        `List action items from "${last.title}"`,
      ];
    }
    return [
      'What can Kasset do?',
      'How do I update my API key?',
      'Explain the system settings',
    ];
  };

  if (!isOpen) return null;

  const currentMessages = chat.currentSession?.messages || [];
  const showEmptyState = currentMessages.length === 0 && !chat.viewHistory;

  return (
    <div className={`w-full h-full border-l ${BORDER.default} ${SURFACE.chatPanel} flex flex-col shadow-xl`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${BORDER.default} h-14 shrink-0`}>
        <div className="flex items-center gap-3">
          {chat.viewHistory && (
            <button
              onClick={() => chat.setViewHistory(false)}
              className={`p-1.5 ${SURFACE.hoverSubtle} rounded-lg transition-colors`}
            >
              <ArrowLeft className={`w-4 h-4 ${TEXT.muted}`} />
            </button>
          )}
          <h2 className={`font-semibold text-sm ${TEXT.primary}`}>
            {chat.viewHistory ? 'Chat History' : 'AI Chat'}
          </h2>
        </div>
        
        <div className="flex items-center gap-1">
          {!chat.viewHistory && (
            <>
              <button
                onClick={chat.newChat}
                className={`p-2 ${SURFACE.hoverSubtle} rounded-lg transition-colors`}
                title="New Chat"
              >
                <MessageSquarePlus className={`w-4 h-4 ${TEXT.muted}`} />
              </button>
              <button
                onClick={() => chat.setViewHistory(true)}
                className={`p-2 ${SURFACE.hoverSubtle} rounded-lg transition-colors`}
                title="Chat History"
              >
                <History className={`w-4 h-4 ${TEXT.muted}`} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className={`p-2 ${SURFACE.hoverSubtle} rounded-lg transition-colors`}
            title="Close"
          >
            <X className={`w-4 h-4 ${TEXT.muted}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {chat.viewHistory ? (
        <ChatHistoryList
          sessions={chat.filteredSessions}
          currentSessionId={chat.currentSessionId}
          searchQuery={chat.searchQuery}
          onSearchChange={chat.setSearchQuery}
          onSelectSession={(id) => {
            chat.selectSession(id);
            chat.setViewHistory(false);
          }}
          onDeleteSession={chat.deleteSession}
          onRenameSession={chat.renameSession}
          onNewChat={() => {
            chat.newChat();
            chat.setViewHistory(false);
          }}
        />
      ) : showEmptyState ? (
        /* Empty state with suggested prompts */
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/30 dark:to-orange-900/30 rounded-2xl flex items-center justify-center mb-6">
            <MessageSquarePlus className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className={`text-lg font-semibold ${TEXT.primary} mb-2`}>
            Start a conversation
          </h3>
          <p className={`text-sm ${TEXT.muted} text-center mb-6 max-w-[280px]`}>
            Ask questions about your recordings, get summaries, or request help with tasks.
          </p>
          
          <div className="w-full space-y-2">
            <p className={`text-xs font-medium ${TEXT.faint} uppercase tracking-wide mb-3`}>
              Suggested prompts
            </p>
            {getSuggestedPrompts().map((prompt, index) => (
              <button
                key={index}
                onClick={() => chat.sendMessage(prompt, historyItems, settings, providers)}
                className={`w-full text-left p-3 ${SURFACE.card} border ${BORDER.strong} rounded-xl text-sm ${TEXT.secondary} ${SURFACE.hoverSubtle} transition-colors`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Messages */
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
              />
            ))}
          </StickToBottom.Content>
          <ScrollToBottomBtn />
        </StickToBottom>
      )}

      {/* Input - always visible except in history view */}
      {!chat.viewHistory && (
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
      )}
    </div>
  );
};

export default ChatPanel;
