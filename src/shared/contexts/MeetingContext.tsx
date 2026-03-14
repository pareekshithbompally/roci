/**
 * Meeting Context
 * 
 * Manages the current meeting/result state and related data.
 * This is the central context that links recordings, transcriptions,
 * summaries, notes, todos, and chats together.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import type { ProcessedResult, HistoryItem, Note, ActionItem } from '@/types';
import { isTauriEnvironment } from '@/services/tauri';
import { notesService, todosService } from '@/services/storage';

interface MeetingState {
  /** Current meeting/result being viewed */
  currentMeeting: HistoryItem | null;
  /** Selected history item ID */
  selectedHistoryId: string | null;
  /** Notes for the current meeting */
  notes: Note[];
  /** User todos for the current meeting */
  userTodos: ActionItem[];
  /** Action item completion status */
  actionItemCompletions: Record<string, boolean>;
  /** Loading state */
  isLoading: boolean;
}

interface MeetingContextValue extends MeetingState {
  /** Set the current meeting */
  setCurrentMeeting: (meeting: HistoryItem | null) => void;
  /** Select a history item and load its data */
  selectHistoryItem: (item: HistoryItem) => Promise<void>;
  /** Clear the current meeting */
  clearMeeting: () => void;
  
  // Notes operations
  addNote: (text: string) => Promise<void>;
  updateNote: (noteId: string, text: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  
  // Todo operations
  addTodo: (text: string, dueDate?: string) => Promise<void>;
  updateTodo: (todoId: string, updates: { text?: string; dueDate?: string }) => Promise<void>;
  deleteTodo: (todoId: string) => Promise<void>;
  toggleTodo: (todoId: string) => Promise<void>;
  
  // Aliases for component compatibility
  addUserTodo: (text: string, dueDate?: string) => Promise<void>;
  updateUserTodo: (todoId: string, updates: { text?: string; dueDate?: string }) => Promise<void>;
  deleteUserTodo: (todoId: string) => Promise<void>;
  
  // Action item operations (AI-generated)
  toggleActionItem: (itemId: string) => void;
  getActionItemsWithStatus: (actionItems?: ActionItem[]) => ActionItem[];
}

const initialState: MeetingState = {
  currentMeeting: null,
  selectedHistoryId: null,
  notes: [],
  userTodos: [],
  actionItemCompletions: {},
  isLoading: false,
};

const MeetingContext = createContext<MeetingContextValue | null>(null);

interface MeetingProviderProps {
  children: ReactNode;
}

export const MeetingProvider: React.FC<MeetingProviderProps> = ({ children }) => {
  const [state, setState] = useState<MeetingState>(initialState);
  
  // Use ref to always have access to current state without causing re-renders
  const stateRef = React.useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Set current meeting
  const setCurrentMeeting = useCallback((meeting: HistoryItem | null) => {
    setState(prev => ({
      ...prev,
      currentMeeting: meeting,
      selectedHistoryId: meeting?.id || null,
    }));
  }, []);

  // Select history item and load its notes/todos
  const selectHistoryItem = useCallback(async (item: HistoryItem) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      let notes: Note[] = [];
      let userTodos: ActionItem[] = [];
      const completions: Record<string, boolean> = {};

      if (isTauriEnvironment()) {
        const [notesResult, todosResult] = await Promise.all([
          notesService.getNotesForMeeting(item.id),
          todosService.getTodosForMeeting(item.id)
        ]);

        if (notesResult.success && notesResult.data) {
          notes = notesResult.data.map(n => ({
            id: n.id,
            text: n.text,
            timestamp: n.timestamp
          }));
        }

        if (todosResult.success && todosResult.data) {
          userTodos = todosResult.data.map(t => ({
            id: t.id,
            text: t.text,
            dueDate: t.dueDate,
            completed: t.completed
          }));
          todosResult.data.forEach(t => {
            completions[t.id] = t.completed;
          });
        }
      }

      setState(prev => ({
        ...prev,
        currentMeeting: item,
        selectedHistoryId: item.id,
        notes,
        userTodos,
        actionItemCompletions: { ...prev.actionItemCompletions, ...completions },
        isLoading: false,
      }));
    } catch (error) {
      console.error('[MeetingContext] Error loading meeting data:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Clear meeting
  const clearMeeting = useCallback(() => {
    setState(initialState);
  }, []);

  // Notes operations
  const addNote = useCallback(async (text: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot add note: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Adding note to meeting:', meetingId);

    if (isTauriEnvironment()) {
      const result = await notesService.addNote(meetingId, text);
      if (result.success && result.data) {
        console.log('[MeetingContext] ✓ Note added successfully:', result.data.id);
        setState(prev => ({
          ...prev,
          notes: [...prev.notes, {
            id: result.data!.id,
            text: result.data!.text,
            timestamp: result.data!.timestamp
          }]
        }));
      } else {
        console.error('[MeetingContext] ✗ Failed to add note:', result.error);
      }
    } else {
      const newNote: Note = {
        id: crypto.randomUUID(),
        text,
        timestamp: Date.now()
      };
      setState(prev => ({
        ...prev,
        notes: [...prev.notes, newNote]
      }));
      console.log('[MeetingContext] ✓ Note added (localStorage)');
    }
  }, []);

  const updateNote = useCallback(async (noteId: string, text: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot update note: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Updating note:', noteId);

    if (isTauriEnvironment()) {
      const result = await notesService.updateNote(meetingId, noteId, text);
      if (result.success) {
        console.log('[MeetingContext] ✓ Note updated successfully');
      } else {
        console.error('[MeetingContext] ✗ Failed to update note:', result.error);
      }
    }

    setState(prev => ({
      ...prev,
      notes: prev.notes.map(note => 
        note.id === noteId ? { ...note, text } : note
      )
    }));
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot delete note: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Deleting note:', noteId);

    if (isTauriEnvironment()) {
      const result = await notesService.deleteNote(meetingId, noteId);
      if (result.success) {
        console.log('[MeetingContext] ✓ Note deleted successfully');
      } else {
        console.error('[MeetingContext] ✗ Failed to delete note:', result.error);
      }
    }

    setState(prev => ({
      ...prev,
      notes: prev.notes.filter(note => note.id !== noteId)
    }));
  }, []);

  // Todo operations
  const addTodo = useCallback(async (text: string, dueDate?: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot add todo: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Adding todo to meeting:', meetingId);

    if (isTauriEnvironment()) {
      const result = await todosService.addTodo(meetingId, text, dueDate);
      if (result.success && result.data) {
        console.log('[MeetingContext] ✓ Todo added successfully:', result.data.id);
        setState(prev => ({
          ...prev,
          userTodos: [{
            id: result.data!.id,
            text: result.data!.text,
            dueDate: result.data!.dueDate,
            completed: result.data!.completed
          }, ...prev.userTodos]
        }));
      } else {
        console.error('[MeetingContext] ✗ Failed to add todo:', result.error);
      }
    } else {
      const newTodo: ActionItem = {
        id: crypto.randomUUID(),
        text,
        dueDate,
        completed: false
      };
      setState(prev => ({
        ...prev,
        userTodos: [newTodo, ...prev.userTodos]
      }));
      console.log('[MeetingContext] ✓ Todo added (localStorage)');
    }
  }, []);

  const updateTodo = useCallback(async (todoId: string, updates: { text?: string; dueDate?: string }) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot update todo: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Updating todo:', todoId, updates);

    if (isTauriEnvironment()) {
      const result = await todosService.updateTodo(meetingId, todoId, updates);
      if (result.success) {
        console.log('[MeetingContext] ✓ Todo updated successfully');
      } else {
        console.error('[MeetingContext] ✗ Failed to update todo:', result.error);
      }
    }

    setState(prev => ({
      ...prev,
      userTodos: prev.userTodos.map(todo =>
        todo.id === todoId ? { ...todo, ...updates } : todo
      )
    }));
  }, []);

  const deleteTodo = useCallback(async (todoId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot delete todo: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Deleting todo:', todoId);

    if (isTauriEnvironment()) {
      const result = await todosService.deleteTodo(meetingId, todoId);
      if (result.success) {
        console.log('[MeetingContext] ✓ Todo deleted successfully');
      } else {
        console.error('[MeetingContext] ✗ Failed to delete todo:', result.error);
      }
    }

    setState(prev => ({
      ...prev,
      userTodos: prev.userTodos.filter(todo => todo.id !== todoId)
    }));
  }, []);

  const toggleTodo = useCallback(async (todoId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) {
      console.warn('[MeetingContext] Cannot toggle todo: no meeting selected');
      return;
    }

    console.log('[MeetingContext] Toggling todo:', todoId);

    if (isTauriEnvironment()) {
      const result = await todosService.toggleTodo(meetingId, todoId);
      if (result.success) {
        console.log('[MeetingContext] ✓ Todo toggled successfully');
        // Update with the actual completed state from storage
        if (result.data) {
          setState(prev => ({
            ...prev,
            userTodos: prev.userTodos.map(todo =>
              todo.id === todoId ? { ...todo, completed: result.data!.completed } : todo
            ),
            actionItemCompletions: {
              ...prev.actionItemCompletions,
              [todoId]: result.data!.completed
            }
          }));
        }
      } else {
        console.error('[MeetingContext] ✗ Failed to toggle todo:', result.error);
      }
    } else {
      // Optimistic update for non-Tauri
      setState(prev => ({
        ...prev,
        actionItemCompletions: {
          ...prev.actionItemCompletions,
          [todoId]: !prev.actionItemCompletions[todoId]
        }
      }));
    }
  }, []);

  // Action item operations
  const toggleActionItem = useCallback((itemId: string) => {
    setState(prev => ({
      ...prev,
      actionItemCompletions: {
        ...prev.actionItemCompletions,
        [itemId]: !prev.actionItemCompletions[itemId]
      }
    }));
  }, []);

  const getActionItemsWithStatus = useCallback((actionItems?: ActionItem[]) => {
    if (!actionItems) return [];
    return actionItems.map(item => ({
      ...item,
      completed: state.actionItemCompletions[item.id] ?? item.completed
    }));
  }, [state.actionItemCompletions]);

  const value: MeetingContextValue = {
    ...state,
    setCurrentMeeting,
    selectHistoryItem,
    clearMeeting,
    addNote,
    updateNote,
    deleteNote,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    toggleActionItem,
    getActionItemsWithStatus,
    // Aliases for component compatibility
    addUserTodo: addTodo,
    updateUserTodo: updateTodo,
    deleteUserTodo: deleteTodo,
  };

  return (
    <MeetingContext.Provider value={value}>
      {children}
    </MeetingContext.Provider>
  );
};

/**
 * useMeeting Hook
 * 
 * Access current meeting state and operations.
 */
export const useMeeting = (): MeetingContextValue => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
};

export default MeetingContext;
