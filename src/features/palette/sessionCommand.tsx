/** A meeting or chat as a palette row — one shape for recents and search results alike: its glyph, the title (matched
 *  words emphasised), the date and where the search matched it, and a meeting's status. */

import React from 'react';
import { AudioWaveform, MessageSquare } from 'lucide-react';
import { MarkedExcerpt, MeetingStatus } from '@shared/components';
import { useMeetingPhase } from '@shared/stores/meetingProgressStore';
import { formatDate } from '@shared/utils/formatters';
import { META_SEPARATOR } from '@config/ui.config';
import type { HistoryItem, UnifiedSidebarItem } from '@shared/types';
import type { PaletteCommand } from './paletteTypes';

const SESSION_ICON = { meeting: AudioWaveform, chat: MessageSquare } as const;

/** A meeting's status as a pill (Ready, Not transcribed…). */
const MeetingBadge: React.FC<{ meeting: HistoryItem }> = ({ meeting }) => <MeetingStatus phase={useMeetingPhase(meeting)} display="badge" />;

interface SessionRowOptions {
  group: string;
  open: (item: UnifiedSidebarItem) => void;
  /** The search typed, to emphasise in the title. */
  query?: string;
  /** Where the search index matched it. */
  excerpt?: string;
}

export function sessionCommand(item: UnifiedSidebarItem, { group, open, query = '', excerpt = '' }: SessionRowOptions): PaletteCommand {
  return {
    id: `${group}:${item.type}:${item.id}`,
    title: item.title,
    group,
    icon: SESSION_ICON[item.type],
    highlight: query.trim() || undefined,
    detail: <>{formatDate(item.timestamp)}{excerpt && <>{META_SEPARATOR}<MarkedExcerpt raw={excerpt} /></>}</>,
    badge: item.historyItem ? <MeetingBadge meeting={item.historyItem} /> : undefined,
    perform: () => open(item),
  };
}
