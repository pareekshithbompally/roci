/**
 * SearchOverlay Component
 *
 * Spotlight-style search overlay triggered by Cmd+K.
 * Built on cmdk (CommandDialog) for keyboard nav, filtering, and focus management.
 * Data sourced from useUnifiedSidebar (meetings + chats).
 */

import React, { useCallback } from 'react';
import { AudioWaveform, MessageSquare, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@shared/ui';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { useChat } from '@shared/contexts/ChatContext';
import { COMPONENT } from '@config/theme.config';
import { formatShortcut } from '@config/shortcuts.config';
import type { UnifiedSidebarItem } from '@/types';

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onOpenChange }) => {
  const { items } = useUnifiedSidebar();
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useApp();
  const chat = useChat();

  const meetings = items.filter((i) => i.type === 'meeting');
  const chats = items.filter((i) => i.type === 'chat');

  const handleSelect = useCallback(
    (item: UnifiedSidebarItem) => {
      if (item.type === 'meeting' && item.historyItem) {
        setCurrentView('home');
        setResult(item.historyItem);
        setSelectedHistoryId(item.historyItem.id);
        chat.setCurrentSessionId(null);
        setStatus(AppStatus.RESULTS);
      } else if (item.type === 'chat' && item.chatSession) {
        chat.selectSession(item.chatSession.id);
        setCurrentView('home');
        setSelectedHistoryId(null);
        setResult(null);
        setStatus(AppStatus.CHAT);
      }
      onOpenChange(false);
    },
    [setCurrentView, setResult, setSelectedHistoryId, setStatus, chat, onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="relative flex items-center">
        <CommandInput
          placeholder="Search meetings and chats..."
          className="pr-16"
        />
        <kbd className={`absolute right-3 ${COMPONENT.kbdBadge}`}>
          {formatShortcut('CommandOrControl+K')}
        </kbd>
      </div>
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-8">
            <Search className="w-5 h-5 text-[var(--text-faint)]" />
            <span className="text-sm text-[var(--text-muted)]">No results found</span>
          </div>
        </CommandEmpty>

        {meetings.length > 0 && (
          <CommandGroup heading="Meetings">
            {meetings.map((item) => (
              <CommandItem
                key={item.id}
                value={`meeting-${item.id}-${item.title}`}
                onSelect={() => handleSelect(item)}
              >
                <AudioWaveform className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.title}</div>
                  {item.matchContext && (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {item.matchContext}
                    </div>
                  )}
                </div>
                <span className="text-xs shrink-0 text-[var(--text-faint)]">Meeting</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {meetings.length > 0 && chats.length > 0 && <CommandSeparator />}

        {chats.length > 0 && (
          <CommandGroup heading="Conversations">
            {chats.map((item) => (
              <CommandItem
                key={item.id}
                value={`chat-${item.id}-${item.title}`}
                onSelect={() => handleSelect(item)}
              >
                <MessageSquare className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.title}</div>
                  {item.matchContext && (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {item.matchContext}
                    </div>
                  )}
                </div>
                <span className="text-xs shrink-0 text-[var(--text-faint)]">Chat</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer hints */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-[var(--border-default)] text-[11px] text-[var(--text-faint)]">
        <span>
          <kbd className="font-medium">↑↓</kbd> Navigate
        </span>
        <span>
          <kbd className="font-medium">↵</kbd> Open
        </span>
        <span>
          <kbd className="font-medium">esc</kbd> Close
        </span>
      </div>
    </CommandDialog>
  );
};

export default SearchOverlay;
