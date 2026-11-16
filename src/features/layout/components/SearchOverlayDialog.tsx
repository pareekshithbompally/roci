/** Cmd+K palette searching meeting and chat content via FTS5 in the Rust backend. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, Loader2, MessageSquare, Search, SearchX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { vectorDB } from '@extensions/rag/client';
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator, Icon, Kbd, Separator, Text } from '@shared/ui';
import { EmptyState } from '@shared/components/EmptyState';
import { useOpenMeeting, useUnifiedSidebar } from '@features/history/hooks';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import type { UnifiedSidebarItem } from '@shared/types';
import { useChatStore } from '@features/chat';
import { formatRelativeTime } from '@shared/utils/formatters';
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

/** Recent items shown for an empty query — the sidebar is already newest-first. */
const RECENT_LIMIT = 6;

const hitKey = (hit: SpotlightHit) => `${hit.source_type}:${hit.source_id}`;

function toHit(item: UnifiedSidebarItem): SpotlightHit {
  return {
    source_type: item.type,
    source_id: item.id,
    title: item.title,
    excerpt: '',
    timestamp: item.timestamp,
    match_type: 'title',
  };
}

/** In-memory title match — instant, and covers items the index hasn't seen yet. */
function titleHits(items: UnifiedSidebarItem[], query: string): SpotlightHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((i) => tokens.every((token) => i.title.toLowerCase().includes(token)))
    .slice(0, SPOTLIGHT_RESULTS_PER_SOURCE * 2)
    .map(toHit);
}

/** DB hits win (they carry excerpts); title hits fill gaps for unindexed items. */
function mergeHits(dbHits: SpotlightHit[], memoryHits: SpotlightHit[]): SpotlightHit[] {
  const dbKeys = new Set(dbHits.map(hitKey));
  return [...dbHits, ...memoryHits.filter((h) => !dbKeys.has(hitKey(h)))];
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onOpenChange }) => (
  <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
    <SpotlightBody onClose={() => onOpenChange(false)} />
  </CommandDialog>
);

/** Palette body; mounts and unmounts with the dialog content, so every open starts fresh with no reset effect. */
function SpotlightBody({ onClose }: { onClose: () => void }) {
  const { items } = useUnifiedSidebar();
  const { setCurrentView, setStatus, setSelectedHistoryId, setResult } = useAppActions();
  const selectSession = useChatStore((s) => s.selectSession);
  const openMeeting = useOpenMeeting();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotlightHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped per keystroke and on unmount so responses for older queries are dropped.
  const searchGenRef = useRef(0);

  const recentItems = useMemo(() => items.slice(0, RECENT_LIMIT), [items]);
  const showRecents = query === '' && recentItems.length > 0;

  const search = useCallback(
    async (q: string, gen: number) => {
      const memoryHits = titleHits(items, q);
      // Title hits paint only onto an empty list; otherwise keep rows until the merged set lands.
      setResults((prev) => (prev.length === 0 ? memoryHits : prev));
      try {
        const dbHits = await vectorDB.spotlightSearch({ query: q, limit: SPOTLIGHT_RESULTS_PER_SOURCE });
        if (gen !== searchGenRef.current) return;
        setResults(mergeHits(dbHits, memoryHits));
      } catch (error: unknown) {
        console.error('[SearchOverlay] Spotlight DB search failed:', error);
        if (gen !== searchGenRef.current) return;
        setResults(memoryHits);
        setSearchError('Search index unavailable');
      } finally {
        if (gen === searchGenRef.current) setIsSearching(false);
      }
    },
    [items],
  );

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      setSearchError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const gen = ++searchGenRef.current;

      if (q.trim().length < SPOTLIGHT_MIN_QUERY_LENGTH) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      // Pending from the keystroke, so the debounce window never flashes "No results".
      setIsSearching(true);
      debounceRef.current = setTimeout(() => void search(q, gen), SPOTLIGHT_DEBOUNCE_MS);
    },
    [search],
  );

  // On unmount: cancel the pending keystroke and drop any in-flight response.
  useEffect(() => () => {
    searchGenRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSelectHit = useCallback(
    async (hit: SpotlightHit) => {
      if (hit.source_type === 'meeting') {
        const sidebarItem = items.find((i) => i.type === 'meeting' && i.id === hit.source_id);
        if (sidebarItem?.historyItem) {
          await openMeeting(sidebarItem.historyItem);
        }
      } else {
        selectSession(hit.source_id);
        setCurrentView('home');
        setSelectedHistoryId(null);
        setResult(null);
        setStatus(AppStatus.CHAT);
      }
      onClose();
    },
    [items, setCurrentView, setSelectedHistoryId, setStatus, setResult, selectSession, onClose, openMeeting],
  );

  const meetingHits = results.filter((h) => h.source_type === 'meeting');
  const chatHits = results.filter((h) => h.source_type === 'chat');

  return (
    <>
      <div className="relative flex items-center">
        <CommandInput
          placeholder="Search meetings and chats..."
          className="pr-16"
          value={query}
          onValueChange={handleQueryChange}
        />
        <div className="pointer-events-none absolute right-3 flex items-center">
          {isSearching ? (
            <Icon icon={Loader2} size="xs" tone="faint" className="animate-spin" />
          ) : results.length > 0 ? (
            <Text variant="helper" tone="faint" className="tabular-nums">
              {results.length}
            </Text>
          ) : null}
        </div>
      </div>
      {/* Fixed frame so the dialog never resizes as results stream in. */}
      <CommandList fill>
        {showRecents ? (
          <CommandGroup heading="Recent">
            {recentItems.map((item) => (
              <HitRow
                key={`recent-${item.type}-${item.id}`}
                value={`recent-${item.type}-${item.id}`}
                icon={item.type === 'meeting' ? AudioWaveform : MessageSquare}
                title={item.title}
                meta={formatRelativeTime(item.timestamp)}
                onSelect={() => handleSelectHit(toHit(item))}
              />
            ))}
          </CommandGroup>
        ) : results.length > 0 ? (
          <>
            <HitGroup heading="Meetings" icon={AudioWaveform} hits={meetingHits} onSelect={handleSelectHit} />
            {meetingHits.length > 0 && chatHits.length > 0 && <CommandSeparator />}
            <HitGroup heading="Chats" icon={MessageSquare} hits={chatHits} onSelect={handleSelectHit} />
          </>
        ) : (
          <SearchStatus query={query} isSearching={isSearching} error={searchError} />
        )}
      </CommandList>

      <Separator />
      <FooterHints />
    </>
  );
}

// ── Internal Components ─────────────────────────────────────────────────────

interface SearchStatusProps {
  query: string;
  isSearching: boolean;
  error: string | null;
}

/** Centered status for a frame with no rows: prompt, pending, or no results. */
function SearchStatus({ query, isSearching, error }: SearchStatusProps) {
  if (query.trim().length < SPOTLIGHT_MIN_QUERY_LENGTH) {
    return (
      <EmptyState
        icon={Search}
        message="Search meetings & chats"
        description="Type to find anything across your sessions"
      />
    );
  }
  if (isSearching) {
    return <EmptyState icon={Search} message="Searching…" />;
  }
  return (
    <EmptyState
      icon={SearchX}
      message={`No results for “${query}”`}
      description={error ?? 'Try different keywords'}
    />
  );
}

interface HitGroupProps {
  heading: string;
  icon: LucideIcon;
  hits: SpotlightHit[];
  onSelect: (hit: SpotlightHit) => void;
}

/** One source's results (meetings or chats); renders nothing when empty. */
function HitGroup({ heading, icon, hits, onSelect }: HitGroupProps) {
  if (hits.length === 0) return null;
  return (
    <CommandGroup heading={`${heading} (${hits.length})`}>
      {hits.map((hit) => (
        <HitRow
          key={hitKey(hit)}
          value={hitKey(hit)}
          icon={icon}
          title={hit.title}
          excerpt={hit.excerpt}
          meta={hit.timestamp ? formatRelativeTime(hit.timestamp) : undefined}
          onSelect={() => onSelect(hit)}
        />
      ))}
    </CommandGroup>
  );
}

interface HitRowProps {
  value: string;
  icon: LucideIcon;
  title: string;
  excerpt?: string;
  /** Trailing metadata (e.g. relative timestamp). */
  meta?: string;
  onSelect: () => void;
}

/** One result row: icon, title + optional excerpt, trailing metadata. */
function HitRow({ value, icon, title, excerpt, meta, onSelect }: HitRowProps) {
  return (
    <CommandItem value={value} onSelect={onSelect}>
      <Icon icon={icon} size="sm" tone="muted" />
      <div className="flex-1 min-w-0">
        <Text as="div" variant="inherit" tone="inherit" truncate>
          {title}
        </Text>
        {excerpt ? <HighlightedExcerpt raw={excerpt} /> : null}
      </div>
      {meta ? (
        <Text variant="helper" tone="faint" className="shrink-0 tabular-nums">
          {meta}
        </Text>
      ) : null}
    </CommandItem>
  );
}

/** Keyboard hints below the results. */
function FooterHints() {
  return (
    <div className="flex items-center gap-4 px-3 py-2">
      <Text variant="helper" tone="faint" className="flex items-center gap-1.5">
        <Kbd>↑↓</Kbd> Navigate
      </Text>
      <Text variant="helper" tone="faint" className="flex items-center gap-1.5">
        <Kbd>↵</Kbd> Open
      </Text>
      <Text variant="helper" tone="faint" className="flex items-center gap-1.5">
        <Kbd>esc</Kbd> Close
      </Text>
    </div>
  );
}

/** Server excerpts wrap matched terms in <<MARK>>…<</MARK>>. */
const MARK_SPLIT = /<<MARK>>|<<\/MARK>>/;

/** Excerpt with matched terms emphasised; a missing close marker degrades to plain text. */
function HighlightedExcerpt({ raw }: { raw: string }) {
  return (
    <Text as="span" variant="helper" tone="muted" className="block truncate mt-0.5">
      {raw.split(MARK_SPLIT).map((part, i) =>
        i % 2 === 1 ? (
          <Text as="span" key={i} variant="inherit" tone="primary" className="font-semibold">
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
