/**
 * Todos Context
 * 
 * Provides todos state and actions to all child components.
 * Manages todos for a specific meeting.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { todosRepository } from '../../../../services/repositories';
import type { TodoEntry } from '@/types';
import type { TodosContextValue, TodosState, Todo, TodoStats } from '../types';
import { calculateTodoStats } from '../types';

const initialState: TodosState = {
  todos: [],
  isLoading: false,
  error: null,
  isCreating: false,
};

const emptyStats: TodoStats = {
  total: 0,
  completed: 0,
  pending: 0,
  overdue: 0,
};

const TodosContext = createContext<TodosContextValue | null>(null);

export const useTodosContext = (): TodosContextValue => {
  const context = useContext(TodosContext);
  if (!context) {
    throw new Error('useTodosContext must be used within a TodosProvider');
  }
  return context;
};

interface TodosProviderProps {
  children: React.ReactNode;
  meetingId?: string | null;
}

export const TodosProvider: React.FC<TodosProviderProps> = ({ children, meetingId = null }) => {
  const [state, setState] = useState<TodosState>(initialState);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(meetingId);

  // Load todos for a meeting
  const loadTodos = useCallback(async (id: string) => {
    console.log('[TodosContext] Loading todos for meeting:', id);
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setCurrentMeetingId(id);

    try {
      const entries = await todosRepository.readDoc(id);
      if (entries && entries.length > 0) {
        const todos: Todo[] = entries.map((t: TodoEntry) => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          dueDate: t.dueDate,
          source: t.source,
          meetingId: id,
          createdAt: t.createdAt,
          updatedAt: t.createdAt,
          version: 1,
        }));
        console.log('[TodosContext] ✓ Loaded', todos.length, 'todos');
        setState(prev => ({ ...prev, todos, isLoading: false }));
      } else {
        console.log('[TodosContext] No todos found for meeting:', id);
        setState(prev => ({ ...prev, todos: [], isLoading: false }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load todos';
      console.error('[TodosContext] ✗ Failed to load todos:', error);
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
    }
  }, []);

  // Auto-load todos when meetingId changes
  useEffect(() => {
    if (meetingId) {
      console.log('[TodosContext] MeetingId changed, loading todos:', meetingId);
      loadTodos(meetingId);
    } else {
      console.log('[TodosContext] No meetingId, clearing todos');
      setState(initialState);
      setCurrentMeetingId(null);
    }
  }, [meetingId, loadTodos]);

  // Add a new todo
  const addTodo = useCallback(async (text: string, dueDate?: string) => {
    if (!currentMeetingId) {
      console.warn('[TodosContext] Cannot add todo: no meeting ID');
      return;
    }

    console.log('[TodosContext] Adding todo to meeting:', currentMeetingId);

    // Create optimistic todo immediately
    const todoId = crypto.randomUUID();
    const optimisticTodo: Todo = {
      id: todoId,
      text,
      completed: false,
      dueDate,
      source: 'user',
      meetingId: currentMeetingId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // Optimistically update UI immediately
    setState(prev => ({
      ...prev,
      todos: [optimisticTodo, ...prev.todos],
      isCreating: false,
    }));

    try {
      const now = new Date().toISOString();
      const todoEntry: TodoEntry = {
        id: todoId,
        text,
        dueDate,
        completed: false,
        source: 'user',
        createdAt: now,
      };
      const ok = await todosRepository.addTodo(currentMeetingId, todoEntry);
      if (ok) {
        console.log('[TodosContext] ✓ Todo saved to disk:', todoEntry.id);
        const realTodo: Todo = {
          id: todoEntry.id,
          text: todoEntry.text,
          completed: false,
          dueDate: todoEntry.dueDate,
          source: 'user',
          meetingId: currentMeetingId,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === optimisticTodo.id ? realTodo : t),
        }));
      } else {
        console.error('[TodosContext] ✗ Failed to save todo, rolling back');
        setState(prev => ({
          ...prev,
          todos: prev.todos.filter(t => t.id !== optimisticTodo.id),
          error: 'Failed to save todo',
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add todo';
      console.error('[TodosContext] ✗ Exception adding todo, rolling back:', error);
      // Roll back optimistic update
      setState(prev => ({
        ...prev,
        todos: prev.todos.filter(t => t.id !== optimisticTodo.id),
        error: errorMessage,
      }));
    }
  }, [currentMeetingId]);

  // Update a todo
  const updateTodo = useCallback(async (todoId: string, updates: { text?: string; dueDate?: string }) => {
    if (!currentMeetingId) return;

    try {
      const ok = await todosRepository.updateTodo(currentMeetingId, todoId, updates);
      if (ok) {
        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === todoId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Delete a todo
  const deleteTodo = useCallback(async (todoId: string) => {
    if (!currentMeetingId) return;

    try {
      const ok = await todosRepository.deleteTodo(currentMeetingId, todoId);
      if (ok) {
        setState(prev => ({
          ...prev,
          todos: prev.todos.filter(t => t.id !== todoId),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Toggle todo completion
  const toggleTodo = useCallback(async (todoId: string) => {
    if (!currentMeetingId) return;

    try {
      const result = await todosRepository.toggleTodo(currentMeetingId, todoId);
      if (result) {
        setState(prev => ({
          ...prev,
          todos: prev.todos.map(t => t.id === todoId ? { ...t, completed: result.completed } : t),
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle todo';
      setState(prev => ({ ...prev, error: errorMessage }));
    }
  }, [currentMeetingId]);

  // Clear todos
  const clearTodos = useCallback(() => {
    setState(initialState);
    setCurrentMeetingId(null);
  }, []);

  // Set creating state
  const setCreating = useCallback((isCreating: boolean) => {
    setState(prev => ({ ...prev, isCreating }));
  }, []);

  // Computed values
  const stats = useMemo(() => 
    state.todos.length > 0 ? calculateTodoStats(state.todos) : emptyStats,
    [state.todos]
  );

  const completedTodos = useMemo(() => 
    state.todos.filter(t => t.completed),
    [state.todos]
  );

  const pendingTodos = useMemo(() => 
    state.todos.filter(t => !t.completed),
    [state.todos]
  );

  const overdueTodos = useMemo(() => {
    const now = new Date();
    return state.todos.filter(t => {
      if (t.completed || !t.dueDate) return false;
      return new Date(t.dueDate) < now;
    });
  }, [state.todos]);

  const value: TodosContextValue = {
    ...state,
    meetingId: currentMeetingId,
    stats,
    completedTodos,
    pendingTodos,
    overdueTodos,
    loadTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    clearTodos,
    setCreating,
  };

  return (
    <TodosContext.Provider value={value}>
      {children}
    </TodosContext.Provider>
  );
};

export default TodosContext;
