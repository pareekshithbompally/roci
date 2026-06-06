/**
 * ChatHistoryList Component
 *
 * Displays a searchable, paginated list of chat sessions.
 * Renders from the lightweight index (no messages required).
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { ChatIndexEntry } from '@shared/types';

interface ChatHistoryListProps {
  sessions: ChatIndexEntry[];
  currentSessionId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onNewChat: () => void;
  isLoadingMore?: boolean;
  onLoadMore: () => void;
}

export const ChatHistoryList: React.FC<ChatHistoryListProps> = ({
  sessions,
  currentSessionId,
  searchQuery,
  onSearchChange,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onNewChat,
  onLoadMore,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = (e: React.MouseEvent, session: ChatIndexEntry) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const handleSaveEdit = (sessionId: string) => {
    if (editValue.trim()) {
      onRenameSession(sessionId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Pagination sentinel — triggers onLoadMore when scrolled into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`p-4 border-b ${BORDER.default}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${TEXT.secondary}`}>
            Chat History
          </h3>
          <button
            onClick={onNewChat}
            className={`text-xs ${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300 transition-colors`}
          >
            + New Chat
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${TEXT.faint}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats..."
            className={`w-full pl-9 pr-4 py-2 ${COMPONENT.inlineInput} transition-all`}
          />
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hover">
        {sessions.length === 0 ? (
          <div className={`text-center py-8 ${TEXT.faint} text-sm`}>
            {searchQuery ? 'No chats match your search' : 'No chat history yet'}
          </div>
        ) : (
          <>
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                  currentSessionId === session.id
                    ? SURFACE.selected
                    : COMPONENT.sidebarItemDefault
                }`}
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className={`w-4 h-4 mt-0.5 ${TEXT.faint}`} />
                  <div className="flex-1 min-w-0">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(session.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className={`flex-1 px-2 py-1 text-sm ${SURFACE.card} border ${BORDER.selectedCard} rounded outline-none ${BORDER.inputFocus}`}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEdit(session.id)}
                          className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className={`text-sm font-medium ${TEXT.primary} truncate`}>
                        {session.title}
                      </div>
                    )}
                    <div className={`mt-1 text-xs ${TEXT.faint}`}>
                      {new Date(session.lastMessageAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                      {session.messageCount !== undefined && ` · ${session.messageCount} msgs`}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {editingId !== session.id && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => handleStartEdit(e, session)}
                      className={`p-2 ${TEXT.faint} hover:text-parchment-800 dark:hover:text-night-300 rounded-lg ${COMPONENT.menuButtonHover} transition-all`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className={`p-2 ${COMPONENT.destructiveHover} rounded-lg ${COMPONENT.menuButtonHover} transition-all`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination sentinel — only shown when not searching */}
            {!searchQuery && (
              <div ref={sentinelRef} className="h-4" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryList;
