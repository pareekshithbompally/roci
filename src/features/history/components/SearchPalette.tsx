/** ⌘K: the Spotlight-style panel beside a column sidebar (Mac, iPad), one layout in every state — meetings and chats
 *  (recents until something is typed, then the matches by kind, each with where it matched), and Settings always at the
 *  bottom (quick settings such as the appearance, then the matching sections). ↑↓ and Return open one, Escape closes.
 *  Meetings and chats come from the same search as the iPhone sidebar's field (useSessionSearch); Settings from the
 *  Settings list itself (useQuickSettings, findSettings). */

import React from 'react';
import { AudioWaveform, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CommandDialog, CommandGroup, CommandInput, CommandList, CommandRow, CommandSeparator, Icon, IconTile, Text, type TileGlyph } from '@shared/ui';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel } from '@shared/stores/appStore';
import { findSettings, useQuickSettings, type QuickSetting } from '@features/settings';
import { matchesEntry } from '@shared/utils/textMatch';
import { formatRelativeTime } from '@shared/utils/formatters';
import { SPOTLIGHT_RECENT_LIMIT } from '@config/chat.config';
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenSession } from '@features/history/hooks/useOpenSession';
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

/** A Settings row: a quick setting (runs) or a section (opens), one shape for both. */
interface SettingsEntry {
  key: string;
  label: string;
  icon: TileGlyph;
  meta?: string;
  run: () => void;
}

/** The Settings group, always last: the quick settings before anything is typed; then the ones matching, and the matching sections. */
function settingsEntries(query: string, searching: boolean, quick: QuickSetting[], openSection: (panel: SettingsPanel) => void): SettingsEntry[] {
  const quickRows = (searching ? quick.filter((q) => matchesEntry(q, query)) : quick)
    .map(({ id, label, icon, run }) => ({ key: `quick:${id}`, label, icon, run }));
  const sections = (searching ? findSettings(query) : [])
    .map(({ id, label, icon }) => ({ key: `section:${id}`, label, icon, meta: 'Settings', run: () => openSection(id) }));
  return [...quickRows, ...sections];
}

/** Searching with no meeting or chat matching: one quiet line where they would be, so the panel keeps its shape. */
const NoSessions: React.FC<{ searching: boolean }> = ({ searching }) => (
  <Text as="p" variant="helper" tone="faint" className="px-2 py-1.5">{searching ? 'Searching…' : 'No meetings or chats match'}</Text>
);

export const SearchPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const { items } = useUnifiedSidebar();
  const search = useSessionSearch(items, query);
  const openSession = useOpenSession();
  const { openSettings } = useAppActions();
  const quick = useQuickSettings();

  const searching = search.matches !== null;
  const groups = sessionGroups(search.matches, items);
  const settings = settingsEntries(query, searching, quick, (panel) => openSettings(panel));

  const openItem = (item: UnifiedSidebarItem) => {
    endSearch();
    openSession(item).catch((error: unknown) => console.error('[SearchPalette] Opening the result failed:', error));
  };
  const runSetting = (entry: SettingsEntry) => {
    endSearch();
    entry.run();
  };

  // One layout in every state: meetings and chats (recents, or the matches), then Settings at the bottom.
  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && endSearch()} label="Search">
      <CommandInput look="spotlight" placeholder="Search meetings, chats and settings" value={query} onValueChange={setSearchQuery} autoFocus />
      <CommandList fit>
        {groups.length === 0 && searching && <NoSessions searching={search.searching} />}
        {groups.map((group, i) => (
          <React.Fragment key={group.heading}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.matches.map((match) => <SessionRow key={`${match.item.type}:${match.item.id}`} match={match} onOpen={openItem} />)}
            </CommandGroup>
          </React.Fragment>
        ))}
        {settings.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              {settings.map((entry) => (
                <CommandRow key={entry.key} value={entry.key} onSelect={() => runSetting(entry)} leading={<IconTile icon={entry.icon} />} label={entry.label} meta={entry.meta} />
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
