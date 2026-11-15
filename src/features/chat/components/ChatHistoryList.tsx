/** Searchable, paginated chat session list, rendered from the index alone. */

import React, { useState, useRef, useEffect } from 'react';
import { Search, MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button, Icon, IconButton, Input, Surface, Text, rowClasses } from '@shared/ui';
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
      <Surface edge="bottom" className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Text as="h3" variant="headline" tone="muted">
            Chat History
          </Text>
          <Button variant="ghost" size="inline" onClick={onNewChat}>
            + New Chat
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Icon icon={Search} size="sm" tone="faint" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-9 pr-4"
          />
        </div>
      </Surface>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hover">
        {sessions.length === 0 ? (
          <Text as="div" tone="faint" className="text-center py-8">
            {searchQuery ? 'No chats match your search' : 'No chat history yet'}
          </Text>
        ) : (
          <>
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group relative ${rowClasses(currentSessionId === session.id)}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon icon={MessageSquare} size="xs" tone="faint" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(session.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="flex-1"
                          autoFocus
                        />
                        <IconButton icon={Check} label="Save" size="sm" onClick={() => handleSaveEdit(session.id)} />
                        <IconButton icon={X} label="Cancel" size="sm" variant="dangerGhost" onClick={handleCancelEdit} />
                      </div>
                    ) : (
                      <Text as="div" variant="bodyStrong" truncate>
                        {session.title}
                      </Text>
                    )}
                    <Text as="div" variant="helper" tone="faint" className="mt-1">
                      {new Date(session.lastMessageAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                      {session.messageCount !== undefined && ` · ${session.messageCount} msgs`}
                    </Text>
                  </div>
                </div>

                {/* Action buttons */}
                {editingId !== session.id && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <IconButton icon={Edit2} label="Rename chat" size="sm" onClick={(e) => handleStartEdit(e, session)} />
                    <IconButton
                      icon={Trash2}
                      label="Delete chat"
                      size="sm"
                      variant="dangerGhost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    />
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
