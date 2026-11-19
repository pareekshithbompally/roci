/** ⌘K: the Spotlight-style panel beside a column sidebar (Mac, iPad). Recents until something is typed, then the Settings
 *  sections, meetings and chats matching it (titles at once, words inside transcripts and messages from the search index,
 *  each with where it matched); ↑↓ and Return open one, Escape closes. Meetings and chats come from the same search as the
 *  iPhone sidebar's field (useSessionSearch); Settings from the Settings list itself (findSettings). */

import React from 'react';
import { AudioWaveform, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandRow, CommandSeparator, Icon, IconTile, Text } from '@shared/ui';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel } from '@shared/stores/appStore';
import { openChat } from '@features/chat';
import { findSettings } from '@features/settings';
import { formatRelativeTime } from '@shared/utils/formatters';
import { SPOTLIGHT_RECENT_LIMIT } from '@config/chat.config';
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenMeeting } from '@features/history/hooks/useOpenMeeting';
import { useSessionSearch, type SessionMatch } from '@features/history/hooks/useSessionSearch';
import type { UnifiedSidebarItem } from '@shared/types';

const KIND_ICON: Record<UnifiedSidebarItem['type'], LucideIcon> = { meeting: AudioWaveform, chat: MessageSquare };
const KINDS = [
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

const SessionRow: React.FC<{ match: SessionMatch; onOpen: (item: UnifiedSidebarItem) => void }> = ({ match: { item, excerpt }, onOpen }) => (
  <CommandRow
    value={`${item.type}:${item.id}`}
    onSelect={() => onOpen(item)}
    leading={<Icon icon={KIND_ICON[item.type]} size="sm" tone="muted" />}
    label={item.title}
    description={excerpt ? <Excerpt raw={excerpt} /> : undefined}
    meta={formatRelativeTime(item.timestamp)}
  />
);

/** Meetings and chats in groups: recents before anything is typed, then the matches by kind. */
function sessionGroups(matches: SessionMatch[] | null, items: UnifiedSidebarItem[]): Array<{ heading: string; matches: SessionMatch[] }> {
  if (!matches) return [{ heading: 'Recent', matches: items.slice(0, SPOTLIGHT_RECENT_LIMIT).map((item) => ({ item, excerpt: '' })) }];
  return KINDS.map(({ type, heading }) => ({ heading, matches: matches.filter((m) => m.item.type === type) })).filter((g) => g.matches.length > 0);
}

/** The line shown when nothing is listed. */
function emptyLine(searchingQuery: boolean, searching: boolean, query: string): string {
  if (!searchingQuery) return 'No meetings or chats yet';
  return searching ? 'Searching…' : `No results for “${query.trim()}”`;
}

export const SearchPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const { items } = useUnifiedSidebar();
  const search = useSessionSearch(items, query);
  const openMeeting = useOpenMeeting();
  const { openSettings } = useAppActions();

  const settings = search.matches ? findSettings(query) : [];
  const groups = sessionGroups(search.matches, items);

  const openSession = (item: UnifiedSidebarItem) => {
    endSearch();
    if (item.type === 'chat') return openChat(item.id);
    if (item.historyItem) openMeeting(item.historyItem).catch((error: unknown) => console.error('[SearchPalette] Opening the meeting failed:', error));
  };
  const openSection = (panel: SettingsPanel) => {
    endSearch();
    openSettings(panel);
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && endSearch()} label="Search">
      <CommandInput look="spotlight" placeholder="Search meetings, chats and settings" value={query} onValueChange={setSearchQuery} autoFocus />
      <CommandList fit>
        <CommandEmpty>{emptyLine(search.matches !== null, search.searching, query)}</CommandEmpty>
        {settings.length > 0 && (
          <CommandGroup heading="Settings">
            {settings.map(({ id, label, icon }) => (
              <CommandRow key={id} value={`settings:${id}`} onSelect={() => openSection(id)} leading={<IconTile icon={icon} />} label={label} meta="Settings" />
            ))}
          </CommandGroup>
        )}
        {groups.map((group, i) => (
          <React.Fragment key={group.heading}>
            {(i > 0 || settings.length > 0) && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.matches.map((match) => <SessionRow key={`${match.item.type}:${match.item.id}`} match={match} onOpen={openSession} />)}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
