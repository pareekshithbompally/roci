/** Meetings as screens read and change them: one meeting's row by id, the meetings matching a filter, and rename / delete.
 *  Each read asks the store for just what the screen shows (see `@shared/query/items`). */

import { useCallback } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { store, type ItemFilter } from '@services/db';
import { meetingService } from '@services/meeting.service';
import { itemEdits, meetingBriefQuery, meetingsFoundQuery, refreshItems } from '@shared/query/items';
import type { HistoryItem } from '@shared/types';

const NONE: HistoryItem[] = [];

/** One meeting's row (name, time, status); null while it loads, when none is asked for, or when it doesn't exist. */
export function useMeetingBrief(id: string | null | undefined): HistoryItem | null {
  const { data } = useQuery({ ...meetingBriefQuery(id ?? ''), enabled: !!id });
  return (id && data) || null;
}

/** The rows read so far; a stable function, so the list keeps its identity while no row changes. */
const readRows = (results: Array<{ data?: HistoryItem | null }>): HistoryItem[] => results.flatMap((r) => (r.data ? [r.data] : []));

/** These meetings' rows, each read and cached on its own; ones that don't exist are left out. */
export function useMeetingBriefs(ids: string[]): HistoryItem[] {
  return useQueries({ queries: ids.map((id) => meetingBriefQuery(id)), combine: readRows });
}

/** The first `limit` meetings matching `filter`, newest first. */
export function useMeetingsFound(filter: Omit<ItemFilter, 'kind'>, limit: number, enabled = true): HistoryItem[] {
  const { data } = useQuery({ ...meetingsFoundQuery(filter, limit), enabled });
  return data ?? NONE;
}

/** Renaming and deleting a meeting: every list shows it at once; the store write follows, then every list reads the truth.
 *  Each resolves whether the store took it. */
export function useMeetingMutations() {
  const renameMeeting = useCallback(async (id: string, title: string): Promise<boolean> => {
    if (!title.trim()) return false;
    await itemEdits.rename(id, title);
    try {
      await store.meetings.rename(id, title);
      return true;
    } catch (error: unknown) {
      console.error('[Meetings] Rename failed:', id, error);
      return false;
    } finally {
      refreshItems();
    }
  }, []);

  const deleteMeeting = useCallback(async (id: string): Promise<boolean> => {
    await itemEdits.remove(id);
    try {
      await meetingService.deleteMeeting(id);
      return true;
    } catch (error: unknown) {
      console.error('[Meetings] Delete failed:', id, error);
      return false;
    } finally {
      refreshItems();
    }
  }, []);

  return { renameMeeting, deleteMeeting };
}
