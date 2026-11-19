/** Search results as palette rows, by kind and in the search's own order: the shared meeting and chat search
 *  (useSessionSearch), each row with the date and where it matched, meetings with their status. */

import React from 'react';
import { MeetingStatus } from '@shared/components';
import { Text } from '@shared/ui';
import { useMeetingPhase } from '@shared/stores/meetingProgressStore';
import { formatDate } from '@shared/utils/formatters';
import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenSession } from '@features/history/hooks/useOpenSession';
import { useSessionSearch, type SessionMatch } from '@features/history/hooks/useSessionSearch';
import { PALETTE_CONFIG } from '@config/palette.config';
import { META_SEPARATOR } from '@config/ui.config';
import { SESSION_ICON } from '@features/palette/sessionIcons';
import type { HistoryItem } from '@shared/types';
import type { PaletteCommand, PaletteGroup, ResultKind } from '@features/palette/paletteTypes';

/** The index wraps matched words in <<MARK>>…<</MARK>>. */
const MARK_SPLIT = /<<MARK>>|<<\/MARK>>/;

/** Where it matched, the matched words stronger. */
const Excerpt: React.FC<{ raw: string }> = ({ raw }) => (
  <>{raw.split(MARK_SPLIT).map((part, i) => (i % 2 === 1 ? <Text key={i} variant="label" tone="primary">{part}</Text> : part))}</>
);

/** A meeting's status as a pill (Ready, Not transcribed…). */
const MeetingBadge: React.FC<{ meeting: HistoryItem }> = ({ meeting }) => <MeetingStatus phase={useMeetingPhase(meeting)} display="badge" />;

const KINDS = [
  { type: 'meeting', title: PALETTE_CONFIG.groups.meetings },
  { type: 'chat', title: PALETTE_CONFIG.groups.chats },
] as const;

interface ResultCommands {
  kinds: PaletteGroup[];
  searching: boolean;
  /** The search index couldn't be read: title matches only. */
  unavailable: boolean;
  /** Kinds the index may hold more of than it returned. */
  capped: ResultKind[];
}

/** `limit`: how many of each kind the index returns (Show All asks for many). */
export function useResultCommands(query: string, limit?: number): ResultCommands {
  const { items } = useUnifiedSidebar();
  const search = useSessionSearch(items, query, limit);
  const openSession = useOpenSession();

  const toCommand = ({ item, excerpt }: SessionMatch): PaletteCommand => ({
    id: `${item.type}:${item.id}`,
    title: item.title,
    group: item.type === 'meeting' ? PALETTE_CONFIG.groups.meetings : PALETTE_CONFIG.groups.chats,
    icon: SESSION_ICON[item.type],
    highlight: query.trim(),
    detail: <>{formatDate(item.timestamp)}{excerpt && <>{META_SEPARATOR}<Excerpt raw={excerpt} /></>}</>,
    badge: item.historyItem ? <MeetingBadge meeting={item.historyItem} /> : undefined,
    perform: () => void openSession(item),
  });

  const matches = search.matches ?? [];
  const kinds = KINDS.map(({ type, title }) => ({ title, kind: type, items: matches.filter((m) => m.item.type === type).map(toCommand) }));
  return { kinds, searching: search.searching, unavailable: search.error !== null, capped: search.capped };
}
