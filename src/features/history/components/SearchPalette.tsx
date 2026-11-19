/** ⌘K: the Spotlight-style panel beside a column sidebar (Mac, iPad). Recents until something is typed, then meetings and
 *  chats matching it (titles at once, words inside transcripts and messages from the search index), each with where it
 *  matched; ↑↓ and Return open one, Escape closes. The same search as the iPhone sidebar's field (useSessionSearch). */

import React from 'react';
import { AudioWaveform, MessageSquare, Search, SearchX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CommandDialog, CommandGroup, CommandInput, CommandList, CommandRow, CommandSeparator, Icon, Kbd, Separator, Text } from '@shared/ui';
import { EmptyState } from '@shared/components/EmptyState';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { openChat } from '@features/chat';
import { formatRelativeTime } from '@shared/utils/formatters';
import { SPOTLIGHT_MIN_QUERY_LENGTH, SPOTLIGHT_RECENT_LIMIT } from '@config/chat.config';
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenMeeting } from '@features/history/hooks/useOpenMeeting';
import { useSessionSearch, type SessionMatch } from '@features/history/hooks/useSessionSearch';
import type { UnifiedSidebarItem } from '@shared/types';

const KIND_ICON: Record<UnifiedSidebarItem['type'], LucideIcon> = { meeting: AudioWaveform, chat: MessageSquare };
const GROUPS = [
  { type: 'meeting', heading: 'Meetings' },
  { type: 'chat', heading: 'Chats' },
] as const;

/** The index wraps matched words in <<MARK>>…<</MARK>>. */
const MARK_SPLIT = /<<MARK>>|<<\/MARK>>/;

/** Where it matched, the matched words stronger. */
const Excerpt: React.FC<{ raw: string }> = ({ raw }) => (
  <>
    {raw.split(MARK_SPLIT).map((part, i) => (i % 2 === 1 ? <Text key={i} variant="label" tone="primary">{part}</Text> : part))}
  </>
);

const ResultRow: React.FC<{ match: SessionMatch; onOpen: (item: UnifiedSidebarItem) => void }> = ({ match: { item, excerpt }, onOpen }) => (
  <CommandRow
    value={`${item.type}:${item.id}`}
    onSelect={() => onOpen(item)}
    leading={<Icon icon={KIND_ICON[item.type]} size="sm" tone="muted" />}
    label={item.title}
    description={excerpt ? <Excerpt raw={excerpt} /> : undefined}
    meta={formatRelativeTime(item.timestamp)}
  />
);

/** Nothing to list: what to type, or that nothing matched. */
const Status: React.FC<{ query: string; searching: boolean; error: string | null }> = ({ query, searching, error }) => {
  if (query.trim().length < SPOTLIGHT_MIN_QUERY_LENGTH) {
    return <EmptyState icon={Search} message="Search meetings and chats" description="Titles, transcripts and messages" />;
  }
  if (searching) return <EmptyState icon={Search} message="Searching…" />;
  return <EmptyState icon={SearchX} message={`No results for “${query.trim()}”`} description={error ?? 'Try other words'} />;
};

const Hints: React.FC = () => (
  <div className="flex items-center gap-4 px-3 py-2">
    {[['↑↓', 'Navigate'], ['↵', 'Open'], ['esc', 'Close']].map(([key, action]) => (
      <Text key={action} variant="helper" tone="faint" className="flex items-center gap-1.5"><Kbd>{key}</Kbd>{action}</Text>
    ))}
  </div>
);

export const SearchPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const { items } = useUnifiedSidebar();
  const search = useSessionSearch(items, query);
  const openMeeting = useOpenMeeting();

  const handleOpen = (item: UnifiedSidebarItem) => {
    endSearch();
    if (item.type === 'chat') return openChat(item.id);
    if (item.historyItem) openMeeting(item.historyItem).catch((error: unknown) => console.error('[SearchPalette] Opening the meeting failed:', error));
  };

  const matches = search.matches ?? items.slice(0, SPOTLIGHT_RECENT_LIMIT).map((item) => ({ item, excerpt: '' }));
  const groups = search.matches
    ? GROUPS.map((group) => ({ heading: group.heading, matches: matches.filter((m) => m.item.type === group.type) })).filter((g) => g.matches.length > 0)
    : [{ heading: 'Recent', matches }];

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && endSearch()} label="Search">
      <CommandInput placeholder="Search meetings and chats" value={query} onValueChange={setSearchQuery} autoFocus />
      {/* A fixed frame, so the panel never jumps as results arrive. */}
      <CommandList fill>
        {groups.length === 0 ? <Status query={query} searching={search.searching} error={search.error} /> : groups.map((group, i) => (
          <React.Fragment key={group.heading}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.matches.map((match) => <ResultRow key={`${match.item.type}:${match.item.id}`} match={match} onOpen={handleOpen} />)}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
      <Separator />
      <Hints />
    </CommandDialog>
  );
};
