/** History split into data and UI contexts so menu/rename/delete-confirm state never re-renders data consumers. */

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HistoryItem } from '@shared/types';
import type { MeetingStatus } from '@shared/types/meetingPhase';
import { store } from '@services/db';
import { meetingService } from '@services/meeting.service';
import { queryKeys } from '@shared/query/queryKeys';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';

/** Categories the Summary model files meetings under (one list, from config). */
const categories: string[] = [...TRANSCRIPTION_CONFIG.categories];

// ── Types ──

interface FilteredHistoryItem extends HistoryItem {
  matchContext?: string;
  matchType?: string;
}

interface HistoryDataContextValue {
  items: HistoryItem[];
  filteredItems: FilteredHistoryItem[];
  searchQuery: string;
  selectedCategory: string | null;
  categories: string[];
  isLoading: boolean;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  loadHistory: () => Promise<void>;
  renameItem: (itemId: string, newTitle: string) => Promise<boolean>;
  updateItem: (itemId: string, updates: Partial<HistoryItem>) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<boolean>;
}

interface HistoryUIContextValue {
  menuOpenId: string | null;
  renameItemId: string | null;
  renameValue: string;
  setMenuOpenId: (id: string | null) => void;
  startRename: (itemId: string, currentTitle: string) => void;
  cancelRename: () => void;
  setRenameValue: (value: string) => void;
}

/** Combined type for backward-compat useHistory() */
type HistoryContextValue = HistoryDataContextValue & HistoryUIContextValue;

// ── Contexts ──

const HistoryDataContext = createContext<HistoryDataContextValue | null>(null);
const HistoryUIContext = createContext<HistoryUIContextValue | null>(null);

// ── Helpers ──

/** Convert MeetingIndexEntry → HistoryItem (lightweight — no transcript/summary) */
function indexEntryToHistoryItem(entry: {
  id: string;
  title: string;
  categories: string[];
  recordingFileName?: string;
  inputSource?: string;
  status: MeetingStatus;
  createdAt: string;
  calendarEventId?: string;
  scheduledTitle?: string;
  participants?: Array<{ name?: string; email?: string; status?: string }>;
  scheduledStart?: string;
  scheduledEnd?: string;
  meetingUrl?: string;
}): HistoryItem {
  return {
    id: entry.id,
    title: entry.title,
    categories: entry.categories,
    recordingFileName: entry.recordingFileName,
    inputSource: entry.inputSource as HistoryItem['inputSource'],
    timestamp: new Date(entry.createdAt).getTime(),
    transcript: '',
    summary: '',
    status: entry.status,
    calendarEventId: entry.calendarEventId,
    scheduledTitle: entry.scheduledTitle,
    participants: entry.participants,
    scheduledStart: entry.scheduledStart,
    scheduledEnd: entry.scheduledEnd,
    meetingUrl: entry.meetingUrl,
  };
}

/** The meeting index query — the app's history list, and outside React (Roci's MCP server). */
export const meetingsQuery = {
  queryKey: queryKeys.meetings(),
  queryFn: async (): Promise<HistoryItem[]> => {
    const result = await store.meetings.list(1000);
    return result.items.map(indexEntryToHistoryItem);
  },
};

// ── Provider ──

interface HistoryProviderProps {
  children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();

  // Ephemeral UI state (never server state — stays in useState)
  const [searchQuery, setSearchQueryRaw] = useState('');
  const [selectedCategory, setSelectedCategoryRaw] = useState<string | null>(null);

  // ── Server state: meeting index ──

  const { data: items = [], isLoading } = useQuery(meetingsQuery);

  // UI state (separate to avoid re-rendering data consumers)
  const [menuOpenId, setMenuOpenIdRaw] = useState<string | null>(null);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  const [renameValue, setRenameValueRaw] = useState('');

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery && !selectedCategory) return items;

    const q = searchQuery.toLowerCase();
    return items.filter(h => {
      if (selectedCategory && !h.categories.includes(selectedCategory)) return false;
      if (!q) return true;
      return h.title.toLowerCase().includes(q)
        || h.categories.some(c => c.toLowerCase().includes(q));
    }) as FilteredHistoryItem[];
  }, [items, searchQuery, selectedCategory]);

  // ── Data methods (optimistic mutations over the meetings query) ──

  const invalidateMeetings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings() });
  }, [queryClient]);

  /** Explicit reload — Query dedups concurrent callers on the same key. */
  const loadHistory = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.meetings() });
  }, [queryClient]);

  const mutateOptions = {
    onError: (_err: unknown, _vars: unknown, context?: { previous?: HistoryItem[] }) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.meetings(), context.previous);
      }
    },
    onSettled: () => invalidateMeetings(),
  };

  const snapshotItems = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: queryKeys.meetings() });
    return { previous: queryClient.getQueryData<HistoryItem[]>(queryKeys.meetings()) };
  }, [queryClient]);

  const renameMutation = useMutation<void, Error, { itemId: string; newTitle: string }, { previous?: HistoryItem[] }>({
    mutationFn: async ({ itemId, newTitle }) => {
      await store.meetings.upsert({ id: itemId, title: newTitle });
    },
    onMutate: async ({ itemId, newTitle }) => {
      const context = await snapshotItems();
      queryClient.setQueryData<HistoryItem[]>(queryKeys.meetings(), (old) =>
        (old || []).map(item => (item.id === itemId ? { ...item, title: newTitle } : item))
      );
      return context;
    },
    ...mutateOptions,
  });

  const renameItem = useCallback(async (itemId: string, newTitle: string): Promise<boolean> => {
    if (!newTitle.trim()) return false;
    try {
      await renameMutation.mutateAsync({ itemId, newTitle });
      setRenameItemId(null);
      setRenameValueRaw('');
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error renaming item:', error);
      return false;
    }
  }, [renameMutation]);

  const updateMutation = useMutation<void, Error, { itemId: string; updates: Partial<HistoryItem> }, { previous?: HistoryItem[] }>({
    mutationFn: async ({ itemId, updates }) => {
      await store.meetings.upsert({
        id: itemId,
        title: updates.title,
        categories: updates.categories,
        inputSource: updates.inputSource,
        calendarEventId: updates.calendarEventId,
      });
    },
    onMutate: async ({ itemId, updates }) => {
      const context = await snapshotItems();
      queryClient.setQueryData<HistoryItem[]>(queryKeys.meetings(), (old) =>
        (old || []).map(item => (item.id === itemId ? { ...item, ...updates } : item))
      );
      return context;
    },
    ...mutateOptions,
  });

  const updateItem = useCallback(async (itemId: string, updates: Partial<HistoryItem>): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ itemId, updates });
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error updating item:', error);
      return false;
    }
  }, [updateMutation]);

  const deleteMutation = useMutation<void, Error, string, { previous?: HistoryItem[] }>({
    mutationFn: async (itemId) => {
      await meetingService.deleteMeeting(itemId);
    },
    onMutate: async (itemId) => {
      const context = await snapshotItems();
      queryClient.setQueryData<HistoryItem[]>(queryKeys.meetings(), (old) =>
        (old || []).filter(item => item.id !== itemId)
      );
      return context;
    },
    ...mutateOptions,
  });

  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(itemId);
      setMenuOpenIdRaw(null);
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error deleting item:', error);
      return false;
    }
  }, []);

  const setSearchQuery = useCallback((query: string) => setSearchQueryRaw(query), []);
  const setSelectedCategory = useCallback((category: string | null) => setSelectedCategoryRaw(category), []);

  // ── UI methods ──

  const setMenuOpenId = useCallback((id: string | null) => setMenuOpenIdRaw(id), []);

  const startRename = useCallback((itemId: string, currentTitle: string) => {
    setRenameItemId(itemId);
    setRenameValueRaw(currentTitle);
    setMenuOpenIdRaw(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenameItemId(null);
    setRenameValueRaw('');
  }, []);

  const setRenameValue = useCallback((value: string) => setRenameValueRaw(value), []);

  // ── Context values (memoized to prevent re-renders) ──

  const dataValue: HistoryDataContextValue = useMemo(() => ({
    items,
    filteredItems,
    searchQuery,
    selectedCategory,
    categories,
    isLoading,
    setSearchQuery,
    setSelectedCategory,
    loadHistory,
    renameItem,
    updateItem,
    deleteItem,
  }), [
    items, filteredItems, searchQuery, selectedCategory, categories, isLoading,
    setSearchQuery, setSelectedCategory,
    loadHistory, renameItem, updateItem, deleteItem,
  ]);

  const uiValue: HistoryUIContextValue = useMemo(() => ({
    menuOpenId,
    renameItemId,
    renameValue,
    setMenuOpenId,
    startRename,
    cancelRename,
    setRenameValue,
  }), [
    menuOpenId, renameItemId, renameValue,
    setMenuOpenId, startRename, cancelRename, setRenameValue,
  ]);

  return (
    <HistoryDataContext.Provider value={dataValue}>
      <HistoryUIContext.Provider value={uiValue}>
        {children}
      </HistoryUIContext.Provider>
    </HistoryDataContext.Provider>
  );
};

// ── Hooks ──

export const useHistoryData = (): HistoryDataContextValue => {
  const context = useContext(HistoryDataContext);
  if (!context) {
    throw new Error('useHistoryData must be used within a HistoryProvider');
  }
  return context;
};

export const useHistoryUI = (): HistoryUIContextValue => {
  const context = useContext(HistoryUIContext);
  if (!context) {
    throw new Error('useHistoryUI must be used within a HistoryProvider');
  }
  return context;
};

export const useHistory = (): HistoryContextValue => {
  const data = useHistoryData();
  const ui = useHistoryUI();
  return { ...data, ...ui };
};

export default HistoryDataContext;
