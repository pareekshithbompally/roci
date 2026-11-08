/**
 * History Context
 *
 * Split into two internal contexts to prevent UI-only state changes
 * (menu toggles, rename mode, delete confirmation) from re-rendering
 * data consumers (ChatPanel, ChatView, IdleView, etc.).
 *
 * - HistoryDataContext: items, categories, filtering, persistence
 * - HistoryUIContext: ephemeral UI state (menus, rename, delete confirm)
 *
 * Consumers:
 *   useHistory()     — full API (backward compat, for sidebar components)
 *   useHistoryData() — data only (for chat, idle, results views)
 */

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { HistoryItem } from '@shared/types';
import { store } from '@services/db';
import { meetingService } from '@services/meeting.service';

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
  setCategories: (categories: string[]) => void;
  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
  loadHistory: () => Promise<void>;
  addToHistory: (item: HistoryItem) => Promise<void>;
  renameItem: (itemId: string, newTitle: string) => Promise<boolean>;
  updateItem: (itemId: string, updates: Partial<HistoryItem>) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<boolean>;
}

interface HistoryUIContextValue {
  menuOpenId: string | null;
  renameItemId: string | null;
  renameValue: string;
  deleteConfirmId: string | null;
  setMenuOpenId: (id: string | null) => void;
  startRename: (itemId: string, currentTitle: string) => void;
  cancelRename: () => void;
  setRenameValue: (value: string) => void;
  setDeleteConfirmId: (id: string | null) => void;
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
  pendingTranscription?: boolean;
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
    pendingTranscription: entry.pendingTranscription,
    calendarEventId: entry.calendarEventId,
    scheduledTitle: entry.scheduledTitle,
    participants: entry.participants,
    scheduledStart: entry.scheduledStart,
    scheduledEnd: entry.scheduledEnd,
    meetingUrl: entry.meetingUrl,
  };
}

// ── Provider ──

interface HistoryProviderProps {
  children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  // Data state
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [searchQuery, setSearchQueryRaw] = useState('');
  const [selectedCategory, setSelectedCategoryRaw] = useState<string | null>(null);
  const [categories, setCategoriesRaw] = useState<string[]>(['Work', 'Personal', 'Meeting', 'Idea']);
  const [isLoading, setIsLoading] = useState(false);

  // UI state (separate to avoid re-rendering data consumers)
  const [menuOpenId, setMenuOpenIdRaw] = useState<string | null>(null);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  const [renameValue, setRenameValueRaw] = useState('');
  const [deleteConfirmId, setDeleteConfirmIdRaw] = useState<string | null>(null);

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

  // ── Data methods ──

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await store.meetings.list(1000);
      setItems(result.items.map(indexEntryToHistoryItem));
    } catch (error) {
      console.error('[HistoryContext] Error loading history:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addToHistory = useCallback(async (item: HistoryItem) => {
    try {
      const now = Date.now();
      await store.meetings.upsert({
        id: item.id,
        title: item.title,
        inputSource: item.inputSource,
        pendingTranscription: item.pendingTranscription,
        calendarEventId: item.calendarEventId,
        calendarMeta: item.scheduledStart ? {
          scheduledTitle: item.scheduledTitle,
          participants: item.participants,
          scheduledStart: item.scheduledStart,
          scheduledEnd: item.scheduledEnd,
          meetingUrl: item.meetingUrl,
        } : undefined,
        categories: item.categories,
        createdAt: now,
      });
      setItems(prev => [item, ...prev]);
    } catch (error) {
      console.error('[HistoryContext] Error adding to history:', error);
    }
  }, []);

  const renameItem = useCallback(async (itemId: string, newTitle: string): Promise<boolean> => {
    if (!newTitle.trim()) return false;
    try {
      await store.meetings.upsert({ id: itemId, title: newTitle });
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, title: newTitle } : item
      ));
      setRenameItemId(null);
      setRenameValueRaw('');
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error renaming item:', error);
      return false;
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, updates: Partial<HistoryItem>): Promise<boolean> => {
    try {
      const input: Parameters<typeof store.meetings.upsert>[0] = { id: itemId, title: updates.title || '' };
      if (updates.categories) input.categories = updates.categories;
      if (updates.inputSource) input.inputSource = updates.inputSource;
      if (updates.recordingFileName) {
        // Not directly settable via meeting upsert — handled by recording operations
      }
      if (updates.pendingTranscription !== undefined) {
        input.pendingTranscription = updates.pendingTranscription;
      }
      if (updates.calendarEventId) input.calendarEventId = updates.calendarEventId;

      await store.meetings.upsert(input);
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      ));
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error updating item:', error);
      return false;
    }
  }, []);

  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      await meetingService.deleteMeeting(itemId);
      setItems(prev => prev.filter(item => item.id !== itemId));
      setDeleteConfirmIdRaw(null);
      setMenuOpenIdRaw(null);
      return true;
    } catch (error) {
      console.error('[HistoryContext] Error deleting item:', error);
      return false;
    }
  }, []);

  const setSearchQuery = useCallback((query: string) => setSearchQueryRaw(query), []);
  const setSelectedCategory = useCallback((category: string | null) => setSelectedCategoryRaw(category), []);
  const setCategories = useCallback((cats: string[]) => setCategoriesRaw(cats), []);

  const addCategory = useCallback((category: string) => {
    if (!category.trim()) return;
    setCategoriesRaw(prev => [...prev, category.trim()]);
  }, []);

  const removeCategory = useCallback((category: string) => {
    setCategoriesRaw(prev => prev.filter(c => c !== category));
  }, []);

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
  const setDeleteConfirmId = useCallback((id: string | null) => setDeleteConfirmIdRaw(id), []);

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
    setCategories,
    addCategory,
    removeCategory,
    loadHistory,
    addToHistory,
    renameItem,
    updateItem,
    deleteItem,
  }), [
    items, filteredItems, searchQuery, selectedCategory, categories, isLoading,
    setSearchQuery, setSelectedCategory, setCategories, addCategory, removeCategory,
    loadHistory, addToHistory, renameItem, updateItem, deleteItem,
  ]);

  const uiValue: HistoryUIContextValue = useMemo(() => ({
    menuOpenId,
    renameItemId,
    renameValue,
    deleteConfirmId,
    setMenuOpenId,
    startRename,
    cancelRename,
    setRenameValue,
    setDeleteConfirmId,
  }), [
    menuOpenId, renameItemId, renameValue, deleteConfirmId,
    setMenuOpenId, startRename, cancelRename, setRenameValue, setDeleteConfirmId,
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
