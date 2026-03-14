/**
 * History Context
 * 
 * Manages history list, search, filtering, and history item operations.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';
import type { HistoryItem } from '@/types';
import { isTauriEnvironment } from '@/services/tauri';
import { historyService } from '@/services/storage';
import { UI_CONFIG } from '@config/ui.config';

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
  /** Save history to storage */
  saveHistory: (items: HistoryItem[]) => Promise<void>;
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

// Helper to get context snippet for search results
const getContextSnippet = (text: string, query: string) => {
  if (!text || !query.trim()) return '';
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text.slice(0, UI_CONFIG.content.snippetLength);
  const start = Math.max(0, index - UI_CONFIG.content.contextBefore);
  const end = Math.min(text.length, index + query.length + UI_CONFIG.content.contextAfter);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
};

interface HistoryProviderProps {
  children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const [state, setState] = useState<HistoryState>(initialState);

  // Computed filtered history
  const filteredItems = useMemo(() => {
    const { items, searchQuery, selectedCategory } = state;
    
    if (!searchQuery && !selectedCategory) return items;

    const q = searchQuery.toLowerCase();

    return items
      .map(h => {
        // Filter by category if selected
        if (selectedCategory && !h.categories.includes(selectedCategory)) return null;

        // If no search query, just return the item
        if (!q) return h;

        const titleMatch = h.title.toLowerCase().includes(q);
        const summaryMatch = h.summary.toLowerCase().includes(q);
        const transcriptMatch = h.transcript.toLowerCase().includes(q);

        if (titleMatch || summaryMatch || transcriptMatch) {
          let matchContext: string | undefined;
          let matchType: string | undefined;

          if (!titleMatch) {
            if (summaryMatch) {
              matchContext = getContextSnippet(h.summary, q);
              matchType = 'summary';
            } else if (transcriptMatch) {
              matchContext = getContextSnippet(h.transcript, q);
              matchType = 'transcript';
            }
          }
          return { ...h, matchContext, matchType };
        }
        return null;
      })
      .filter(Boolean) as FilteredHistoryItem[];
  }, [state.items, state.searchQuery, state.selectedCategory]);

  // Load history from storage
  const loadHistory = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      if (isTauriEnvironment()) {
        const result = await historyService.load();
        if (result.success && result.data) {
          setState(prev => ({
            ...prev,
            items: result.data || [],
            isLoading: false,
          }));
        }
      } else {
        const stored = localStorage.getItem('system_listen_history_v2');
        if (stored) {
          setState(prev => ({
            ...prev,
            items: JSON.parse(stored),
            isLoading: false,
          }));
        }
      }
    } catch (error) {
      console.error('[HistoryContext] Error loading history:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Save history to storage
  const saveHistory = useCallback(async (items: HistoryItem[]) => {
    setState(prev => ({ ...prev, items }));
    
    try {
      if (isTauriEnvironment()) {
        await historyService.save(items);
      } else {
        localStorage.setItem('system_listen_history_v2', JSON.stringify(items));
      }
    } catch (error) {
      console.error('[HistoryContext] Error saving history:', error);
    }
  }, []);

  // Add to history
  const addToHistory = useCallback(async (item: HistoryItem) => {
    const newItems = [item, ...state.items];
    await saveHistory(newItems);
  }, [state.items, saveHistory]);

  // Rename history item
  const renameItem = useCallback(async (itemId: string, newTitle: string): Promise<boolean> => {
    if (!newTitle.trim()) return false;

    try {
      const updatedItems = state.items.map(item =>
        item.id === itemId ? { ...item, title: newTitle } : item
      );

      if (isTauriEnvironment()) {
        const historyResult = await historyService.load();
        if (historyResult.success && historyResult.data) {
          const updated = historyResult.data.map(item =>
            item.id === itemId ? { ...item, title: newTitle } : item
          );
          await historyService.save(updated);
        }
      } else {
        localStorage.setItem('system_listen_history_v2', JSON.stringify(updatedItems));
      }

      setState(prev => ({
        ...prev,
        items: updatedItems,
        renameItemId: null,
        renameValue: '',
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error renaming item:', error);
      return false;
    }
  }, [state.items]);

  // Update history item in-place
  const updateItem = useCallback(async (itemId: string, updates: Partial<HistoryItem>): Promise<boolean> => {
    try {
      const updatedItems = state.items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );

      if (isTauriEnvironment()) {
        const historyResult = await historyService.load();
        if (historyResult.success && historyResult.data) {
          const updated = historyResult.data.map(item =>
            item.id === itemId ? { ...item, ...updates } : item
          );
          await historyService.save(updated);
        }
      } else {
        localStorage.setItem('system_listen_history_v2', JSON.stringify(updatedItems));
      }

      setState(prev => ({
        ...prev,
        items: updatedItems,
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error updating item:', error);
      return false;
    }
  }, [state.items]);

  // Delete history item
  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      const updatedItems = state.items.filter(item => item.id !== itemId);

      if (isTauriEnvironment()) {
        await historyService.remove(itemId);
        historyService.clearCache();
      } else {
        localStorage.setItem('system_listen_history_v2', JSON.stringify(updatedItems));
      }

      setState(prev => ({
        ...prev,
        items: updatedItems,
        deleteConfirmId: null,
        menuOpenId: null,
      }));

      return true;
    } catch (error) {
      console.error('[HistoryContext] Error deleting item:', error);
      return false;
    }
  }, [state.items]);

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
    saveHistory,
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
