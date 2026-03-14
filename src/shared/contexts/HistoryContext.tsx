/**
 * History Context
 *
 * Manages history list, search, filtering, and history item operations.
 * Uses meeting index repository for persistence (meetings/index.json).
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { HistoryItem, MeetingIndexEntry } from '@/types';
import { meetingIndexRepository } from '@/services/repositories';
import { meetingService } from '@/services/meeting.service';
interface HistoryState {
  /** All history items */
  items: HistoryItem[];
  /** Search query */
  searchQuery: string;
  /** Selected filter category */
  selectedCategory: string | null;
  /** Available categories */
  categories: string[];
  /** Loading state */
  isLoading: boolean;
  /** Currently open menu item ID */
  menuOpenId: string | null;
  /** Item being renamed */
  renameItemId: string | null;
  /** Rename input value */
  renameValue: string;
  /** Item pending delete confirmation */
  deleteConfirmId: string | null;
}

interface FilteredHistoryItem extends HistoryItem {
  matchContext?: string;
  matchType?: string;
}

interface HistoryContextValue extends HistoryState {
  /** Filtered history items based on search and category */
  filteredItems: FilteredHistoryItem[];
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Set selected category filter */
  setSelectedCategory: (category: string | null) => void;
  /** Set categories list */
  setCategories: (categories: string[]) => void;
  /** Add a category */
  addCategory: (category: string) => void;
  /** Remove a category */
  removeCategory: (category: string) => void;
  /** Load history from storage */
  loadHistory: () => Promise<void>;
  /** Add item to history */
  addToHistory: (item: HistoryItem) => Promise<void>;
  /** Rename a history item */
  renameItem: (itemId: string, newTitle: string) => Promise<boolean>;
  /** Update a history item in-place */
  updateItem: (itemId: string, updates: Partial<HistoryItem>) => Promise<boolean>;
  /** Delete a history item */
  deleteItem: (itemId: string) => Promise<boolean>;
  /** Set menu open state */
  setMenuOpenId: (id: string | null) => void;
  /** Start rename mode */
  startRename: (itemId: string, currentTitle: string) => void;
  /** Cancel rename mode */
  cancelRename: () => void;
  /** Set rename value */
  setRenameValue: (value: string) => void;
  /** Set delete confirm ID */
  setDeleteConfirmId: (id: string | null) => void;
}

const initialState: HistoryState = {
  items: [],
  searchQuery: '',
  selectedCategory: null,
  categories: ['Work', 'Personal', 'Meeting', 'Idea'],
  isLoading: false,
  menuOpenId: null,
  renameItemId: null,
  renameValue: '',
  deleteConfirmId: null,
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

/** Convert MeetingIndexEntry → HistoryItem (lightweight — no transcript/summary) */
function indexEntryToHistoryItem(entry: MeetingIndexEntry): HistoryItem {
  return {
    id: entry.id,
    title: entry.title,
    categories: entry.categories,
    recordingFileName: entry.recordingFileName,
    inputSource: entry.inputSource as HistoryItem['inputSource'],
    timestamp: new Date(entry.createdAt).getTime(),
    transcript: '',
    summary: '',
  };
}

interface HistoryProviderProps {
  children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const [state, setState] = useState<HistoryState>(initialState);

  // Computed filtered history — searches title and categories from index.
  // Full-text content search (transcript/summary) would require async loading
  // of each meeting's data — TODO: implement async content search if needed.
  const filteredItems = useMemo(() => {
    const { items, searchQuery, selectedCategory } = state;

    if (!searchQuery && !selectedCategory) return items;

    const q = searchQuery.toLowerCase();

    return items
      .filter(h => {
        // Filter by category if selected
        if (selectedCategory && !h.categories.includes(selectedCategory)) return false;

        // If no search query, category match is enough
        if (!q) return true;

        // Search title and categories
        return h.title.toLowerCase().includes(q)
          || h.categories.some(c => c.toLowerCase().includes(q));
      }) as FilteredHistoryItem[];
  }, [state.items, state.searchQuery, state.selectedCategory]);

  // Load history from storage
  const loadHistory = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const indexEntries = await meetingIndexRepository.loadIndex();
      const items = indexEntries.map(indexEntryToHistoryItem);
      setState(prev => ({ ...prev, items, isLoading: false }));
    } catch (error) {
      console.error('[HistoryContext] Error loading history:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Add to history
  const addToHistory = useCallback(async (item: HistoryItem) => {
    try {
      const now = new Date().toISOString();
      await meetingIndexRepository.addToIndex({
        id: item.id,
        title: item.title,
        categories: item.categories,
        recordingFileName: item.recordingFileName,
        inputSource: item.inputSource,
        createdAt: now,
        updatedAt: now,
      });
      setState(prev => ({ ...prev, items: [item, ...prev.items] }));
    } catch (error) {
      console.error('[HistoryContext] Error adding to history:', error);
    }
  }, []);

  // Rename history item
  const renameItem = useCallback(async (itemId: string, newTitle: string): Promise<boolean> => {
    if (!newTitle.trim()) return false;

    try {
      await meetingIndexRepository.updateInIndex(itemId, { title: newTitle });

      setState(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, title: newTitle } : item
        ),
        renameItemId: null,
        renameValue: '',
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error renaming item:', error);
      return false;
    }
  }, []);

  // Update history item in-place
  const updateItem = useCallback(async (itemId: string, updates: Partial<HistoryItem>): Promise<boolean> => {
    try {
      // Update index with index-relevant fields only
      const indexUpdates: Partial<MeetingIndexEntry> = {};
      if (updates.title) indexUpdates.title = updates.title;
      if (updates.categories) indexUpdates.categories = updates.categories;
      if (updates.recordingFileName) indexUpdates.recordingFileName = updates.recordingFileName;
      if (Object.keys(indexUpdates).length > 0) {
        await meetingIndexRepository.updateInIndex(itemId, indexUpdates);
      }

      setState(prev => ({
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        ),
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error updating item:', error);
      return false;
    }
  }, []);

  // Delete history item
  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      await meetingService.deleteMeeting(itemId);

      setState(prev => ({
        ...prev,
        items: prev.items.filter(item => item.id !== itemId),
        deleteConfirmId: null,
        menuOpenId: null,
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error deleting item:', error);
      return false;
    }
  }, []);

  // Simple state setters
  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setSelectedCategory = useCallback((category: string | null) => {
    setState(prev => ({ ...prev, selectedCategory: category }));
  }, []);

  const setCategories = useCallback((categories: string[]) => {
    setState(prev => ({ ...prev, categories }));
  }, []);

  const addCategory = useCallback((category: string) => {
    if (!category.trim()) return;
    setState(prev => ({
      ...prev,
      categories: [...prev.categories, category.trim()]
    }));
  }, []);

  const removeCategory = useCallback((category: string) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== category)
    }));
  }, []);

  const setMenuOpenId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, menuOpenId: id }));
  }, []);

  const startRename = useCallback((itemId: string, currentTitle: string) => {
    setState(prev => ({
      ...prev,
      renameItemId: itemId,
      renameValue: currentTitle,
      menuOpenId: null,
    }));
  }, []);

  const cancelRename = useCallback(() => {
    setState(prev => ({
      ...prev,
      renameItemId: null,
      renameValue: '',
    }));
  }, []);

  const setRenameValue = useCallback((value: string) => {
    setState(prev => ({ ...prev, renameValue: value }));
  }, []);

  const setDeleteConfirmId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, deleteConfirmId: id }));
  }, []);

  const value: HistoryContextValue = {
    ...state,
    filteredItems,
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
    setMenuOpenId,
    startRename,
    cancelRename,
    setRenameValue,
    setDeleteConfirmId,
  };

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  );
};

/**
 * useHistory Hook
 *
 * Access history state and operations.
 */
export const useHistory = (): HistoryContextValue => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
};

export default HistoryContext;
