/**
 * Meeting Context
 *
 * Manages the current meeting/result state and related data.
 * Uses new repositories for notes/todos persistence.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import type { HistoryItem, Note, ActionItem, NoteEntry, TodoEntry } from '@/types';
import { notesRepository, todosRepository } from '@/services/repositories';

interface MeetingState {
  /** Current meeting/result being viewed */
  currentMeeting: HistoryItem | null;
  /** Selected history item ID */
  selectedHistoryId: string | null;
  /** Notes for the current meeting */
  notes: Note[];
  /** User-created todos for the current meeting */
  userTodos: ActionItem[];
  /** AI-generated action items loaded from storage */
  aiTodos: ActionItem[];
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
  /** Get AI action items with up-to-date completion status */
  getActionItemsWithStatus: () => ActionItem[];
}

const initialState: MeetingState = {
  currentMeeting: null,
  selectedHistoryId: null,
  notes: [],
  userTodos: [],
  aiTodos: [],
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
      let aiTodos: ActionItem[] = [];
      const completions: Record<string, boolean> = {};

      const [noteEntries, todoEntries] = await Promise.all([
        notesRepository.readDoc(item.id),
        todosRepository.readDoc(item.id),
      ]);

      if (noteEntries && noteEntries.length > 0) {
        notes = noteEntries.map((n: NoteEntry) => ({
          id: n.id,
          text: n.text,
          timestamp: new Date(n.createdAt).getTime(),
        }));
      }

      if (todoEntries && todoEntries.length > 0) {
        const aiEntries = todoEntries.filter(t => t.source === 'ai');
        const userEntries = todoEntries.filter(t => t.source !== 'ai');

        userTodos = userEntries.map((t: TodoEntry) => ({
          id: t.id,
          text: t.text,
          owner: t.owner,
          dueDate: t.dueDate,
          completed: t.completed,
        }));

        aiTodos = aiEntries.map((t: TodoEntry) => ({
          id: t.id,
          text: t.text,
          owner: t.owner,
          dueDate: t.dueDate,
          completed: t.completed,
        }));

        // Track completion status for AI action items (used by SummaryView toggles)
        aiEntries.forEach((t: TodoEntry) => {
          completions[t.id] = t.completed;
        });
      }

      setState(prev => ({
        ...prev,
        currentMeeting: item,
        selectedHistoryId: item.id,
        notes,
        userTodos,
        aiTodos,
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
    if (!meetingId) return;

    const now = new Date().toISOString();
    const noteEntry: NoteEntry = {
      id: crypto.randomUUID(),
      text,
      createdAt: now,
      updatedAt: now,
    };

    await notesRepository.addNote(meetingId, noteEntry);

    setState(prev => ({
      ...prev,
      notes: [...prev.notes, {
        id: noteEntry.id,
        text: noteEntry.text,
        timestamp: new Date(noteEntry.createdAt).getTime(),
      }]
    }));
  }, []);

  const updateNote = useCallback(async (noteId: string, text: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    await notesRepository.updateNote(meetingId, noteId, text);

    setState(prev => ({
      ...prev,
      notes: prev.notes.map(note =>
        note.id === noteId ? { ...note, text } : note
      )
    }));
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    await notesRepository.deleteNote(meetingId, noteId);

    setState(prev => ({
      ...prev,
      notes: prev.notes.filter(note => note.id !== noteId)
    }));
  }, []);

  // Todo operations
  const addTodo = useCallback(async (text: string, dueDate?: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    const now = new Date().toISOString();
    const todoEntry: TodoEntry = {
      id: crypto.randomUUID(),
      text,
      dueDate,
      completed: false,
      source: 'user',
      createdAt: now,
    };

    await todosRepository.addTodo(meetingId, todoEntry);

    setState(prev => ({
      ...prev,
      userTodos: [{
        id: todoEntry.id,
        text: todoEntry.text,
        dueDate: todoEntry.dueDate,
        completed: false,
      }, ...prev.userTodos]
    }));
  }, []);

  const updateTodo = useCallback(async (todoId: string, updates: { text?: string; dueDate?: string }) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    await todosRepository.updateTodo(meetingId, todoId, updates);

    setState(prev => ({
      ...prev,
      userTodos: prev.userTodos.map(todo =>
        todo.id === todoId ? { ...todo, ...updates } : todo
      )
    }));
  }, []);

  const deleteTodo = useCallback(async (todoId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    await todosRepository.deleteTodo(meetingId, todoId);

    setState(prev => ({
      ...prev,
      userTodos: prev.userTodos.filter(todo => todo.id !== todoId)
    }));
  }, []);

  const toggleTodo = useCallback(async (todoId: string) => {
    const meetingId = stateRef.current.selectedHistoryId;
    if (!meetingId) return;

    const result = await todosRepository.toggleTodo(meetingId, todoId);
    if (result) {
      setState(prev => ({
        ...prev,
        userTodos: prev.userTodos.map(todo =>
          todo.id === todoId ? { ...todo, completed: result.completed } : todo
        ),
        actionItemCompletions: {
          ...prev.actionItemCompletions,
          [todoId]: result.completed,
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

  const getActionItemsWithStatus = useCallback(() => {
    return state.aiTodos.map(item => ({
      ...item,
      completed: state.actionItemCompletions[item.id] ?? item.completed
    }));
  }, [state.aiTodos, state.actionItemCompletions]);

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
