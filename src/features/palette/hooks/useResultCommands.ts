/** Search results as palette rows, by kind and in the search's own order: the shared meeting and chat search
 *  (useSessionSearch), each row with the date and where it matched, meetings with their status. */

import { useUnifiedSidebar } from '@features/history/hooks/useUnifiedSidebar';
import { useOpenSession } from '@features/history/hooks/useOpenSession';
import { useSessionSearch } from '@features/history/hooks/useSessionSearch';
import { PALETTE_CONFIG } from '@config/palette.config';
import { sessionCommand } from '@features/palette/sessionCommand';
import type { UnifiedSidebarItem } from '@shared/types';
import type { PaletteGroup, ResultKind } from '@features/palette/paletteTypes';

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

  const open = (item: UnifiedSidebarItem) => void openSession(item);
  const matches = search.matches ?? [];
  const kinds = KINDS.map(({ type, title }) => ({
    title,
    kind: type,
    items: matches.filter((m) => m.item.type === type).map(({ item, excerpt }) => sessionCommand(item, { group: title, open, query, excerpt })),
  }));
  return { kinds, searching: search.searching, unavailable: search.error !== null, capped: search.capped };
}
