/**
 * SearchOverlay Component
 *
 * Spotlight-style search overlay triggered by Cmd+K.
 * Searches meeting content AND chat content via FTS5 in the Rust backend.
 * Built on cmdk (CommandDialog) for keyboard nav and focus management.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioWaveform, Loader2, MessageSquare, Search } from 'lucide-react';
import { vectorDB } from '@extensions/rag/client';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, Kbd, Text } from '@shared/ui';
import { useUnifiedSidebar } from '@shared/hooks/useUnifiedSidebar';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useChat } from '@shared/contexts/ChatContext';
import { useMeetingDetailLoader } from '@shared/hooks/useMeetingDetailLoader';
import { shortcutLabel } from '@features/shortcuts';
import {
  SPOTLIGHT_DEBOUNCE_MS,
  SPOTLIGHT_MIN_QUERY_LENGTH,
  SPOTLIGHT_RESULTS_PER_SOURCE,
} from '@config/chat.config';
import type { SpotlightHit } from '@extensions/rag/client';

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function titleMatchesAllKeywords(title: string, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return false;

  const normalizedTitle = title.toLowerCase();
  return tokens.every((token) => normalizedTitle.includes(token));
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onOpenChange }) => {
  const { items } = useUnifiedSidebar();
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const chat = useChat();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);

  const triggerSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < SPOTLIGHT_MIN_QUERY_LENGTH) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const gen = ++searchGenRef.current;
      setSearchError(null);

      // In-memory title match — instant, always covers unindexed items
      const memoryHits: SpotlightHit[] = items
        .filter((i) => titleMatchesAllKeywords(i.title, query))
        .slice(0, SPOTLIGHT_RESULTS_PER_SOURCE * 2)
        .map((i) => ({
          source_type: i.type as 'meeting' | 'chat',
          source_id: i.id,
          title: i.title,
          excerpt: '',
          timestamp: i.timestamp,
          match_type: 'title' as const,
        }));

      if (gen !== searchGenRef.current) return;
      setResults(memoryHits);
      setIsSearching(true);

      // DB search adds content excerpts for indexed items
      try {
        const dbHits = await vectorDB.spotlightSearch({
          query,
          limit: SPOTLIGHT_RESULTS_PER_SOURCE,
        });
        if (gen !== searchGenRef.current) return;

        // DB hits take priority (have excerpts); memory fills gaps for unindexed items
        const dbKeys = new Set(dbHits.map((h) => `${h.source_type}:${h.source_id}`));
        const merged = [
          ...dbHits,
          ...memoryHits.filter((h) => !dbKeys.has(`${h.source_type}:${h.source_id}`)),
        ];
        setResults(merged);
      } catch (error: unknown) {
        console.error('[SearchOverlay] Spotlight DB search failed:', error);
        if (gen === searchGenRef.current) {
          setSearchError('Search index unavailable');
        }
      } finally {
        if (gen === searchGenRef.current) setIsSearching(false);
      }
    }, SPOTLIGHT_DEBOUNCE_MS);
  }, [items]);

  // Reset state on close; clear any pending debounce on unmount.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      searchGenRef.current = 0;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadMeetingDetail = useMeetingDetailLoader();

  const handleSelectHit = useCallback(
    async (hit: SpotlightHit) => {
      if (hit.source_type === 'meeting') {
        const sidebarItem = items.find((i) => i.type === 'meeting' && i.id === hit.source_id);
        if (sidebarItem?.historyItem) {
          const hi = sidebarItem.historyItem;
          setCurrentView('home');
          setSelectedHistoryId(hit.source_id);
          chat.setCurrentSessionId(null);

          // Generation-guarded lazy load (newest selection wins).
          await loadMeetingDetail(hi);

          setStatus(AppStatus.RESULTS);
        }
      } else if (hit.source_type === 'chat') {
        chat.selectSession(hit.source_id);
        setCurrentView('home');
        setSelectedHistoryId(null);
        setResult(null);
        setStatus(AppStatus.CHAT);
      }
      onOpenChange(false);
    },
    [items, setCurrentView, setResult, setSelectedHistoryId, setStatus, chat, onOpenChange, loadMeetingDetail],
  );

  const meetingHits = results.filter((h) => h.source_type === 'meeting');
  const chatHits = results.filter((h) => h.source_type === 'chat');

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <div className="relative flex items-center">
        <CommandInput
          placeholder="Search meetings and chats..."
          className="pr-16"
          onValueChange={(val) => { setQuery(val); triggerSearch(val); }}
        />
        {isSearching && (
          <Loader2 className="absolute right-10 w-3.5 h-3.5 animate-spin text-faint" />
        )}
        <Kbd className="absolute right-3">{shortcutLabel('search')}</Kbd>
      </div>
      <CommandList className="min-h-40">
        <CommandEmpty>
          {query.length < SPOTLIGHT_MIN_QUERY_LENGTH || isSearching ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Search className="w-5 h-5 text-faint" />
              <Text variant="bodyStrong" tone="muted">Search meetings &amp; chats</Text>
              <Text variant="helper" tone="faint">Type to find anything across your sessions</Text>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10">
              <Text tone="muted">No results for &ldquo;{query}&rdquo;</Text>
              <Text variant="helper" tone="faint">{searchError ?? 'Try different keywords'}</Text>
            </div>
          )}
        </CommandEmpty>

        {meetingHits.length > 0 && (
          <CommandGroup heading="Meetings">
            {meetingHits.map((hit) => (
              <CommandItem
                key={`meeting-${hit.source_id}`}
                value={`meeting-${hit.source_id}-${hit.title}`}
                onSelect={() => handleSelectHit(hit)}
              >
                <AudioWaveform className="w-4 h-4 shrink-0 text-faint" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{hit.title}</div>
                  {hit.excerpt && (
                    <HighlightedExcerpt
                      raw={hit.excerpt}
                      className="block truncate text-callout text-muted mt-0.5"
                    />
                  )}
                </div>
                <Text variant="helper" tone="faint" className="shrink-0">Meeting</Text>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {meetingHits.length > 0 && chatHits.length > 0 && <CommandSeparator />}

        {chatHits.length > 0 && (
          <CommandGroup heading="Chats">
            {chatHits.map((hit) => (
              <CommandItem
                key={`chat-${hit.source_id}`}
                value={`chat-${hit.source_id}-${hit.title}`}
                onSelect={() => handleSelectHit(hit)}
              >
                <MessageSquare className="w-4 h-4 shrink-0 text-faint" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{hit.title}</div>
                  {hit.excerpt && (
                    <HighlightedExcerpt
                      raw={hit.excerpt}
                      className="block truncate text-callout text-muted mt-0.5"
                    />
                  )}
                </div>
                <Text variant="helper" tone="faint" className="shrink-0">Chat</Text>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer hints */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-muted text-subheadline text-faint">
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


// ── Internal Components ──────────────────────────────────────────────────────

const MARK_OPEN = '<<MARK>>';
const MARK_CLOSE = '<</MARK>>';

interface HighlightedExcerptProps {
  raw: string;
  className?: string;
}

/**
 * Renders a text excerpt with <<MARK>>term<</MARK>> markers as <mark> elements.
 * Returns null for empty excerpts.
 */
function HighlightedExcerpt({ raw, className }: HighlightedExcerptProps) {
  if (!raw) return null;

  const parts: React.ReactNode[] = [];
  let remaining = raw;
  let key = 0;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf(MARK_OPEN);
    if (openIdx === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (openIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, openIdx)}</span>);
    }

    const afterOpen = remaining.slice(openIdx + MARK_OPEN.length);
    const closeIdx = afterOpen.indexOf(MARK_CLOSE);

    if (closeIdx === -1) {
      // Malformed: no closing marker — render remainder as plain text
      parts.push(<span key={key++}>{afterOpen}</span>);
      break;
    }

    const highlighted = afterOpen.slice(0, closeIdx);
    parts.push(
      <strong
        key={key++}
        className="font-semibold text-primary"
      >
        {highlighted}
      </strong>,
    );

    remaining = afterOpen.slice(closeIdx + MARK_CLOSE.length);
  }

  return <span className={className}>{parts}</span>;
}
