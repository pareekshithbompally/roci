/** ⌘K: the Spotlight-style panel beside a column sidebar (Mac, iPad), one fixed frame in every state — meetings and chats
 *  scroll inside it (recents until something is typed; then title matches at once, content matches added below them,
 *  never reordered), and two Settings rows are pinned under it (what matches, else the quick settings). ↑↓ and Return
 *  open one, Escape closes. Meetings and chats come from the same search as the iPhone sidebar's field (useSessionSearch);
 *  Settings from the Settings list itself (useQuickSettings, findSettings). */

import React from 'react';
import { AudioWaveform, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CommandDialog, CommandGroup, CommandInput, CommandList, CommandRow, CommandSeparator, Icon, IconTile, Separator, Text, type TileGlyph } from '@shared/ui';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery } from '@shared/stores/searchStore';
import { useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel } from '@shared/stores/appStore';
import { findSettings, useQuickSettings, type QuickSetting } from '@features/settings';
import { matchesEntry } from '@shared/utils/textMatch';
import { formatRelativeTime } from '@shared/utils/formatters';
import { SPOTLIGHT_SETTINGS_ROWS } from '@config/chat.config';
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
  // Before anything is typed: every meeting and chat, newest first, filling the frame and scrolling inside it.
  if (!matches) return [{ heading: 'Recent', matches: items.map((item) => ({ item, excerpt: '' })) }];
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

/** The pinned Settings rows, always SPOTLIGHT_SETTINGS_ROWS of them: what matches the search first (quick settings, then
 *  sections), the quick settings filling the rest — so the footer never changes size. */
function settingsEntries(query: string, quick: QuickSetting[], openSection: (panel: SettingsPanel) => void): SettingsEntry[] {
  const quickRow = ({ id, label, icon, run }: QuickSetting): SettingsEntry => ({ key: `quick:${id}`, label, icon, run });
  const typed = query.trim().length > 0;
  const matching: SettingsEntry[] = typed ? [
    ...quick.filter((q) => matchesEntry(q, query)).map(quickRow),
    ...findSettings(query).map(({ id, label, icon }) => ({ key: `section:${id}`, label, icon, meta: 'Settings', run: () => openSection(id) })),
  ] : [];
  const fill = quick.map(quickRow).filter((row) => !matching.some((m) => m.key === row.key));
  return [...matching, ...fill].slice(0, SPOTLIGHT_SETTINGS_ROWS);
}

/** The search finished with no meeting or chat matching: one quiet line where they would be. */
const NoSessions: React.FC = () => (
  <Text as="p" variant="helper" tone="faint" className="px-2 py-1.5">No meetings or chats match</Text>
);

export const SearchPalette: React.FC = () => {
  const open = useSearchActive();
  const query = useSearchQuery();
  const { items } = useUnifiedSidebar();
  const search = useSessionSearch(items, query);
  const openSession = useOpenSession();
  const { openSettings } = useAppActions();
  const quick = useQuickSettings();

  const groups = sessionGroups(search.matches, items);
  const settings = settingsEntries(query, quick, (panel) => openSettings(panel));
  const nothingFound = search.matches !== null && groups.length === 0 && !search.searching;

  const openItem = (item: UnifiedSidebarItem) => {
    endSearch();
    openSession(item).catch((error: unknown) => console.error('[SearchPalette] Opening the result failed:', error));
  };
  const runSetting = (entry: SettingsEntry) => {
    endSearch();
    entry.run();
  };

  // One fixed frame in every state: meetings and chats scroll inside it (recents, or the matches); Settings is pinned under it.
  return (
    <CommandDialog open={open} onOpenChange={(next) => !next && endSearch()} label="Search">
      <CommandInput look="spotlight" placeholder="Search meetings, chats and settings" value={query} onValueChange={setSearchQuery} autoFocus />
      <CommandList spotlight>
        {nothingFound && <NoSessions />}
        {groups.map((group, i) => (
          <React.Fragment key={group.heading}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.matches.map((match) => <SessionRow key={`${match.item.type}:${match.item.id}`} match={match} onOpen={openItem} />)}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
      <Separator />
      <CommandGroup heading="Settings" className="p-1">
        {settings.map((entry) => (
          <CommandRow key={entry.key} value={entry.key} onSelect={() => runSetting(entry)} leading={<IconTile icon={entry.icon} />} label={entry.label} meta={entry.meta} />
        ))}
      </CommandGroup>
    </CommandDialog>
  );
};
